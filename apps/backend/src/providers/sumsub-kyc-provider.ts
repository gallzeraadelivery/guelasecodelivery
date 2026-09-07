import { createHmac } from "node:crypto";
import type { KycCheckResult, KycStatus, KycSubmissionInput, KYCProvider } from "./kyc-provider.js";

const SUMSUB_BASE_URL = "https://api.sumsub.com";

export type SumsubConfig = {
  appToken: string;
  secretKey: string;
  /**
   * Nome do nível de verificação configurado no Dashboard do Sumsub
   * (Verification levels). Não existe um valor universal — cada workspace
   * define o seu; não deve ser adivinhado/hardcoded aqui.
   */
  levelName: string;
};

type SumsubApplicantResponse = {
  id: string;
  review?: { reviewStatus?: string };
};

type SumsubReviewResult = {
  reviewAnswer?: "GREEN" | "RED";
  rejectLabels?: string[];
};

type SumsubStatusResponse = {
  reviewStatus: string;
  reviewResult?: SumsubReviewResult;
};

class SumsubApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Implementação Sumsub do KYCProvider (seção 11/33), escrita a partir da
 * documentação real confirmada nesta conversa: "Authentication" (assinatura
 * HMAC-SHA256), "Create applicant", "Add verification documents", "Request
 * applicant check" e "Get applicant review status". Substitui o CAF, que
 * nunca teve autocadastro self-service (exigia contato comercial).
 */
export class SumsubKycProvider implements KYCProvider {
  constructor(private readonly config: SumsubConfig) {}

  private sign(method: string, uriWithQuery: string, body: Buffer): { ts: string; sig: string } {
    const ts = Math.floor(Date.now() / 1000).toString();
    const hmac = createHmac("sha256", this.config.secretKey);
    hmac.update(ts + method.toUpperCase() + uriWithQuery);
    if (body.length > 0) hmac.update(body);
    return { ts, sig: hmac.digest("hex") };
  }

  private async request(
    method: "GET" | "POST",
    uriWithQuery: string,
    options: { body?: Buffer; contentType?: string; headers?: Record<string, string> } = {},
  ): Promise<unknown> {
    const body = options.body ?? Buffer.alloc(0);
    const { ts, sig } = this.sign(method, uriWithQuery, body);

    const response = await fetch(`${SUMSUB_BASE_URL}${uriWithQuery}`, {
      method,
      headers: {
        "X-App-Token": this.config.appToken,
        "X-App-Access-Sig": sig,
        "X-App-Access-Ts": ts,
        ...(options.contentType ? { "Content-Type": options.contentType } : {}),
        ...options.headers,
      },
      body: body.length > 0 ? body : undefined,
    });

    const text = await response.text();
    const json: unknown = text ? JSON.parse(text) : {};

    if (!response.ok) {
      throw new SumsubApiError(`Sumsub ${method} ${uriWithQuery} falhou (${response.status}): ${text}`, response.status);
    }
    return json;
  }

  /**
   * Um entregador pode chamar /drivers/kyc mais de uma vez (ex.: reenvio
   * depois de uma rejeição). Como usamos driverId como externalUserId, a
   * segunda tentativa faz o Sumsub responder 409 "Applicant ... already
   * exists" em vez de criar um novo — nesse caso, reaproveitamos o applicant
   * existente em vez de falhar.
   */
  private async createApplicant(driverId: string): Promise<string> {
    const query = `?levelName=${encodeURIComponent(this.config.levelName)}`;
    const uri = `/resources/applicants${query}`;
    const body = Buffer.from(
      JSON.stringify({
        externalUserId: driverId,
        type: "individual",
        fixedInfo: { country: "BRA" },
      }),
    );

    try {
      const result = (await this.request("POST", uri, { body, contentType: "application/json" })) as SumsubApplicantResponse;
      return result.id;
    } catch (error) {
      if (error instanceof SumsubApiError && error.status === 409) {
        return this.getApplicantIdByExternalUserId(driverId);
      }
      throw error;
    }
  }

  // Endpoint não confirmado por documentação colada nesta conversa — inferido
  // do padrão "-;campo=valor" usado por outros endpoints do Sumsub para
  // buscar um recurso por uma chave alternativa (visto em "Get applicant
  // actions": /resources/applicantActions/-;applicantId={id}). Se estiver
  // errado, vai falhar de forma explícita (erro da API do Sumsub nos logs),
  // não silenciosamente.
  private async getApplicantIdByExternalUserId(externalUserId: string): Promise<string> {
    const uri = `/resources/applicants/-;externalUserId=${encodeURIComponent(externalUserId)}/one`;
    const result = (await this.request("GET", uri)) as SumsubApplicantResponse;
    return result.id;
  }

  /**
   * Monta o multipart usando FormData/Blob/Request nativos do Node (undici)
   * em vez de montar os bytes à mão — testado contra a API real do Sumsub e
   * confirmado correto. `idDocSubType` usa os valores "FRONT_SIDE"/"BACK_SIDE"
   * (não "FRONT"/"BACK" — testado e confirmado; o valor errado faz a API
   * responder 400 "Cannot read a metadata object from the body", uma mensagem
   * enganosa que não indica o campo real com problema).
   */
  private async uploadDocument(
    applicantId: string,
    idDocType: "DRIVERS" | "SELFIE",
    imageBase64: string,
    side?: "FRONT_SIDE" | "BACK_SIDE",
  ): Promise<void> {
    const metadata: Record<string, string> = { idDocType, country: "BRA" };
    if (side) metadata.idDocSubType = side;

    const form = new FormData();
    form.append("metadata", JSON.stringify(metadata));
    form.append("content", new Blob([Buffer.from(imageBase64, "base64")], { type: "image/jpeg" }), "document.jpg");

    const uri = `/resources/applicants/${applicantId}/info/idDoc`;
    const probeRequest = new Request(`${SUMSUB_BASE_URL}${uri}`, { method: "POST", body: form });
    const body = Buffer.from(await probeRequest.arrayBuffer());
    const contentType = probeRequest.headers.get("content-type") ?? undefined;

    await this.request("POST", uri, {
      body,
      contentType,
      headers: { "X-Return-Doc-Warnings": "true" },
    });
  }

  private async requestCheck(applicantId: string): Promise<void> {
    await this.request("POST", `/resources/applicants/${applicantId}/status/pending`, {
      body: Buffer.alloc(0),
    });
  }

  private async fetchStatus(applicantId: string): Promise<SumsubStatusResponse> {
    return (await this.request("GET", `/resources/applicants/${applicantId}/status`)) as SumsubStatusResponse;
  }

  private toKycCheckResult(applicantId: string, status: SumsubStatusResponse): KycCheckResult {
    return {
      externalCheckId: applicantId,
      status: mapReviewStatus(status),
      checks:
        status.reviewStatus === "completed" && status.reviewResult
          ? { approved: status.reviewResult.reviewAnswer === "GREEN" }
          : {},
      raw: status,
    };
  }

  async submitCheck(input: KycSubmissionInput): Promise<KycCheckResult> {
    const applicantId = await this.createApplicant(input.driverId);

    if (input.documentFrontBase64) {
      await this.uploadDocument(applicantId, "DRIVERS", input.documentFrontBase64, "FRONT_SIDE");
    }
    if (input.documentBackBase64) {
      await this.uploadDocument(applicantId, "DRIVERS", input.documentBackBase64, "BACK_SIDE");
    }
    if (input.selfieBase64) {
      await this.uploadDocument(applicantId, "SELFIE", input.selfieBase64);
    }

    await this.requestCheck(applicantId);

    const status = await this.fetchStatus(applicantId);
    return this.toKycCheckResult(applicantId, status);
  }

  async getCheckStatus(externalCheckId: string): Promise<KycCheckResult> {
    const status = await this.fetchStatus(externalCheckId);
    return this.toKycCheckResult(externalCheckId, status);
  }
}

function mapReviewStatus(status: SumsubStatusResponse): KycStatus {
  if (status.reviewStatus === "completed") {
    const answer = status.reviewResult?.reviewAnswer;
    if (answer === "GREEN") return "APPROVED";
    if (answer === "RED") return "REJECTED";
    return "REVIEW";
  }
  if (status.reviewStatus === "onHold") return "REVIEW";
  return "PENDING";
}
