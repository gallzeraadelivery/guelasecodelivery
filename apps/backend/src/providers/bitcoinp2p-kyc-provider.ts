import type { KycCheckResult, KycSubmissionInput, KYCProvider } from "./kyc-provider.js";

/**
 * Implementação BitcoinP2P do KYCProvider.
 *
 * DIFERENTE do MercadoPagoPaymentProvider: ali eu tinha confiança razoável na
 * documentação pública (API amplamente conhecida e estável). Aqui NÃO tenho
 * nenhum conhecimento confiável do contrato real da API do BitcoinP2P —
 * endpoint, formato de payload, nomes de campo, tudo seria inventado. Em vez
 * de fabricar uma integração que parece funcionar mas não tem base real,
 * este provider fica estruturalmente pronto (a interface e o restante do
 * fluxo de KYC — banco, RLS, endpoint — já funcionam) mas lança um erro
 * claro até recebermos a documentação/credenciais reais.
 *
 * O que preciso para terminar isto de verdade: a documentação da API do
 * BitcoinP2P (endpoints de envio de documento/selfie e de consulta de
 * status) e uma API key de teste.
 */
export class BitcoinP2PKycProvider implements KYCProvider {
  constructor(private readonly apiKey: string) {}

  async submitCheck(_input: KycSubmissionInput): Promise<KycCheckResult> {
    void this.apiKey;
    throw new Error(
      "Integração com BitcoinP2P ainda não implementada — falta a documentação real da API. " +
        "Ver comentário em bitcoinp2p-kyc-provider.ts.",
    );
  }

  async getCheckStatus(_externalCheckId: string): Promise<KycCheckResult> {
    throw new Error(
      "Integração com BitcoinP2P ainda não implementada — falta a documentação real da API.",
    );
  }
}
