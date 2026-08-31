/**
 * Abstração do envio real do saque via PIX (seção 38/39). request_withdrawal
 * (RPC) já reserva o saldo e cria o registro REQUESTED de forma síncrona e
 * independente deste provider — quem efetivamente transfere o dinheiro é uma
 * etapa separada (processamento manual/administrativo na Fase 10, ou um job
 * automático futuro), para nunca travar a solicitação do entregador atrás de
 * uma chamada de rede a um provedor externo.
 */

export type PixKeyType = "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "RANDOM";

export type PixPayoutInput = {
  withdrawalId: string;
  amountCents: number;
  pixKey: string;
  pixKeyType: PixKeyType;
  holderName: string;
};

export type PixPayoutResult = {
  externalId: string;
  status: "PAID" | "PROCESSING" | "FAILED";
  raw: unknown;
};

export interface PayoutProvider {
  sendPixPayout(input: PixPayoutInput): Promise<PixPayoutResult>;
}
