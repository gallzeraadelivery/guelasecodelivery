import { createHmac, randomBytes } from "node:crypto";
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
    options: { body?: Buffer; contentType?: string } = {},
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
      },
      body: body.length > 0 ? body : undefined,
    });

    const text = await response.text();
    const json: unknown = text ? JSON.parse(text) : {};

    if (!response.ok) {
      throw new Error(`Sumsub ${method} ${uriWithQuery} falhou (${response.status}): ${text}`);
    }
    return json;
  }

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

    const result = (await this.request("POST", uri, { body, contentType: "application/json" })) as SumsubApplicantResponse;
    return result.id;
  }

  private async uploadDocument(
    applicantId: string,
    idDocType: "DRIVERS" | "SELFIE",
    imageBase64: string,
    side?: "FRONT" | "BACK",
  ): Promise<void> {
    const boundary = `----GuelaSecoSumsub${randomBytes(16).toString("hex")}`;
    const metadata: Record<string, string> = { idDocType, country: "BRA" };
    if (side) metadata.idDocSubType = side;

    const imageBuffer = Buffer.from(imageBase64, "base64");
    const parts: Buffer[] = [
      // Sem Content-Type nesta parte de propósito: o exemplo oficial do Sumsub
      // (curl -F 'metadata={...}') envia o campo sem header de tipo — quando
      // testamos com "Content-Type: application/json" aqui, a API respondeu
      // 400 "Cannot read a metadata object from the body".
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      ),
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="content"; filename="document.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
      ),
      imageBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ];
    const body = Buffer.concat(parts);

    await this.request("POST", `/resources/applicants/${applicantId}/info/idDoc`, {
      body,
      contentType: `multipart/form-data; boundary=${boundary}`,
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
      await this.uploadDocument(applicantId, "DRIVERS", input.documentFrontBase64, "FRONT");
    }
    if (input.documentBackBase64) {
      await this.uploadDocument(applicantId, "DRIVERS", input.documentBackBase64, "BACK");
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
