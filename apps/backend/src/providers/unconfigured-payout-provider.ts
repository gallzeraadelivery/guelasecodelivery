import type { PayoutProvider, PixPayoutInput, PixPayoutResult } from "./payout-provider.js";

/**
 * NENHUM provedor de PIX (envio) foi decidido/configurado ainda. Candidatos
 * possíveis: a própria API de "money-out"/PIX da Mercado Pago (já integrada
 * via OAuth para os pagamentos — mas a API de saque é um produto diferente,
 * cujo contrato real eu não tenho confiança suficiente em reproduzir sem
 * documentação), ou um provedor de PIX dedicado.
 *
 * Igual ao BitcoinP2PKycProvider: em vez de fabricar uma integração que
 * parece funcionar mas não tem base real, esta implementação fica pronta
 * estruturalmente (todo o fluxo de carteira/ledger/saque já funciona; o
 * saque fica com status REQUESTED aguardando processamento) e lança um erro
 * claro apenas se algo tentar de fato disparar o envio automático.
 */
export class UnconfiguredPayoutProvider implements PayoutProvider {
  async sendPixPayout(_input: PixPayoutInput): Promise<PixPayoutResult> {
    throw new Error(
      "Nenhum provedor de saque PIX configurado. Defina qual provedor usar (Mercado Pago money-out ou " +
        "um provedor de PIX dedicado) e as credenciais correspondentes para automatizar o envio.",
    );
  }
}
