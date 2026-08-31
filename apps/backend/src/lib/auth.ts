import type { FastifyRequest } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";

export class UnauthorizedError extends Error {}

/**
 * Valida o token Supabase enviado pelo app (Authorization: Bearer <token>) e
 * retorna o id do usuário autenticado. O app nunca fala direto com tabelas
 * críticas — só com este backend, que decide o que é permitido.
 */
export async function requireUserId(request: FastifyRequest, db: SupabaseClient): Promise<string> {
  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

  if (!token) {
    throw new UnauthorizedError("Token de autenticação ausente.");
  }

  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) {
    throw new UnauthorizedError("Token de autenticação inválido.");
  }

  return data.user.id;
}

/**
 * Igual a requireUserId, mas também garante que o profile é 'admin'. Não há
 * self-signup de administrador (mesmo princípio de partners: conta criada
 * pela própria administração via service_role) — profiles.role = 'admin' é
 * a única fonte de verdade.
 */
export async function requireAdminId(request: FastifyRequest, db: SupabaseClient): Promise<string> {
  const userId = await requireUserId(request, db);

  const { data: profile } = await db.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (profile?.role !== "admin") {
    throw new UnauthorizedError("Acesso restrito à administração.");
  }

  return userId;
}
