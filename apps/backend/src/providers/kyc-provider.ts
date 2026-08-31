/**
 * Abstração de verificação de identidade do entregador (seção 11/33). Nenhuma
 * regra de negócio deve depender diretamente do BitcoinP2P — só desta
 * interface, para permitir trocar por Idwall/CAF/Unico no futuro sem tocar
 * em cadastro, dispatch ou antifraude.
 */

export type KycStatus = "PENDING" | "APPROVED" | "REJECTED" | "REVIEW";

export type KycSubmissionInput = {
  driverId: string;
  cpf: string;
  cnhNumber: string;
  cnhCategory: string;
  selfieBase64?: string;
  documentFrontBase64?: string;
  documentBackBase64?: string;
};

export type KycCheckResult = {
  externalCheckId: string;
  status: KycStatus;
  checks: Record<string, boolean>;
  raw: unknown;
};

export interface KYCProvider {
  submitCheck(input: KycSubmissionInput): Promise<KycCheckResult>;
  getCheckStatus(externalCheckId: string): Promise<KycCheckResult>;
}
