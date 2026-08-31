/**
 * Estimativa de ETA sem chamar API de rota paga (seção 10 da arquitetura):
 * distância (já calculada pelo Postgres/PostGIS via ST_Distance) dividida por
 * uma velocidade média configurável, somada ao tempo médio de preparo.
 * Suficiente para ranquear candidatos; ETA de rota real (Mapbox) fica para
 * quando houver credenciais e a necessidade justificar o custo.
 */
export function estimateEtaMinutes(
  distanceKm: number,
  avgSpeedKmh: number,
  preparationMinutes: number,
): number {
  const travelMinutes = (distanceKm / avgSpeedKmh) * 60;
  return Math.round((travelMinutes + preparationMinutes) * 10) / 10;
}
