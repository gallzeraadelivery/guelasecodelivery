export type DriverPayoutRule = {
  min_cents: number;
  per_km_cents: number;
};

/**
 * Motor de remuneração v1 (seção 30): mínimo por corrida + valor por km da
 * distância total (retirada + entrega). Mais fatores (espera, chuva, alta
 * demanda...) entram aqui no futuro sem mudar quem chama esta função — a
 * regra usada é sempre salva como snapshot na oferta (seção 43/61).
 */
export function computeDriverPayoutCents(totalDistanceKm: number, rule: DriverPayoutRule): number {
  const distanceBased = Math.round(totalDistanceKm * rule.per_km_cents);
  return Math.max(rule.min_cents, distanceBased);
}
