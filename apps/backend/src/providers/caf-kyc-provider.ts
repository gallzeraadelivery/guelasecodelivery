import type { KycCheckResult, KycSubmissionInput, KYCProvider } from "./kyc-provider.js";

/**
 * Implementação CAF (Combate à Fraude) do KYCProvider.
 *
 * DIFERENTE do MercadoPagoPaymentProvider: ali eu tinha confiança razoável na
 * documentação pública (API amplamente conhecida e estável). Aqui NÃO tenho
 * confiança real no contrato da API do CAF — endpoint, formato de payload,
 * nomes de campo, esquema de autenticação — seriam inventados. Em vez de
 * fabricar uma integração que parece funcionar mas não tem base real, este
 * provider fica estruturalmente pronto (a interface e o restante do fluxo de
 * KYC — banco, RLS, endpoint, sincronização de drivers.kyc_status — já
 * funcionam) mas lança um erro claro até recebermos a documentação/
 * credenciais reais.
 *
 * O que preciso para terminar isto de verdade: a documentação técnica da API
 * do CAF (endpoint de submissão de documento+selfie, esquema de autenticação,
 * formato de resposta/status) e uma API key de teste.
 */
export class CafKycProvider implements KYCProvider {
  constructor(private readonly apiKey: string) {}

  async submitCheck(_input: KycSubmissionInput): Promise<KycCheckResult> {
    void this.apiKey;
    throw new Error(
      "Integração com CAF ainda não implementada — falta a documentação real da API. " +
        "Ver comentário em caf-kyc-provider.ts.",
    );
  }

  async getCheckStatus(_externalCheckId: string): Promise<KycCheckResult> {
    throw new Error("Integração com CAF ainda não implementada — falta a documentação real da API.");
  }
}
