import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * O `state` do OAuth do Mercado Pago não carrega sessão do usuário (o
 * navegador só volta com code+state, sem Authorization header) — por isso
 * assinamos o partner_id aqui para: (1) provar que este callback corresponde
 * a um connect que este backend de fato iniciou (CSRF) e (2) saber para qual
 * distribuidora salvar o token, sem precisar de mais nenhum estado guardado.
 */
export function signPartnerState(partnerId: string, secret: string): string {
  const signature = createHmac("sha256", secret).update(partnerId).digest("hex");
  return `${partnerId}.${signature}`;
}

export function verifyPartnerState(state: string, secret: string): string | null {
  const [partnerId, signature] = state.split(".");
  if (!partnerId || !signature) return null;

  const expected = createHmac("sha256", secret).update(partnerId).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const receivedBuf = Buffer.from(signature, "utf8");

  if (expectedBuf.length !== receivedBuf.length || !timingSafeEqual(expectedBuf, receivedBuf)) {
    return null;
  }
  return partnerId;
}
