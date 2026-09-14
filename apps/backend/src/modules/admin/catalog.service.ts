import type { SupabaseClient } from "@supabase/supabase-js";

export type CategoryRow = {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  active: boolean;
};

export async function listCategories(db: SupabaseClient): Promise<CategoryRow[]> {
  const { data, error } = await db
    .from("categories")
    .select("id, name, parent_id, sort_order, active")
    .order("sort_order");

  if (error) throw new Error(`Falha ao listar categorias: ${error.message}`);
  return data ?? [];
}

export async function createCategory(
  db: SupabaseClient,
  input: { name: string; parentId: string | null; sortOrder: number },
): Promise<CategoryRow> {
  const { data, error } = await db
    .from("categories")
    .insert({ name: input.name, parent_id: input.parentId, sort_order: input.sortOrder })
    .select("id, name, parent_id, sort_order, active")
    .single();

  if (error) throw new Error(`Falha ao criar categoria: ${error.message}`);
  return data;
}

export class CatalogProductNotFoundError extends Error {}

export type CatalogProductRow = {
  id: string;
  name: string;
  brand: string | null;
  description: string | null;
  category_id: string | null;
  image_url: string | null;
  unit: string;
  volume_ml: number | null;
  alcohol_content_pct: number | null;
  requires_age_verification: boolean;
  active: boolean;
};

const CATALOG_PRODUCT_COLUMNS =
  "id, name, brand, description, category_id, image_url, unit, volume_ml, alcohol_content_pct, requires_age_verification, active";

export async function listCatalogProducts(db: SupabaseClient, search?: string): Promise<CatalogProductRow[]> {
  let query = db.from("catalog_products").select(CATALOG_PRODUCT_COLUMNS).order("name");
  if (search) query = query.ilike("name", `%${search}%`);

  const { data, error } = await query;
  if (error) throw new Error(`Falha ao listar produtos: ${error.message}`);
  return data ?? [];
}

export type CatalogProductInput = {
  name: string;
  brand: string | null;
  description: string | null;
  categoryId: string | null;
  unit: string;
  volumeMl: number | null;
  alcoholContentPct: number | null;
  requiresAgeVerification: boolean;
};

export async function createCatalogProduct(
  db: SupabaseClient,
  input: CatalogProductInput,
): Promise<CatalogProductRow> {
  const { data, error } = await db
    .from("catalog_products")
    .insert({
      name: input.name,
      brand: input.brand,
      description: input.description,
      category_id: input.categoryId,
      unit: input.unit,
      volume_ml: input.volumeMl,
      alcohol_content_pct: input.alcoholContentPct,
      requires_age_verification: input.requiresAgeVerification,
    })
    .select(CATALOG_PRODUCT_COLUMNS)
    .single();

  if (error) throw new Error(`Falha ao criar produto: ${error.message}`);
  return data;
}

export async function updateCatalogProduct(
  db: SupabaseClient,
  id: string,
  input: Partial<CatalogProductInput> & { active?: boolean },
): Promise<CatalogProductRow> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.brand !== undefined) patch.brand = input.brand;
  if (input.description !== undefined) patch.description = input.description;
  if (input.categoryId !== undefined) patch.category_id = input.categoryId;
  if (input.unit !== undefined) patch.unit = input.unit;
  if (input.volumeMl !== undefined) patch.volume_ml = input.volumeMl;
  if (input.alcoholContentPct !== undefined) patch.alcohol_content_pct = input.alcoholContentPct;
  if (input.requiresAgeVerification !== undefined) patch.requires_age_verification = input.requiresAgeVerification;
  if (input.active !== undefined) patch.active = input.active;

  const { data, error } = await db
    .from("catalog_products")
    .update(patch)
    .eq("id", id)
    .select(CATALOG_PRODUCT_COLUMNS)
    .maybeSingle();

  if (error) throw new Error(`Falha ao atualizar produto: ${error.message}`);
  if (!data) throw new CatalogProductNotFoundError(`Produto não encontrado: ${id}`);
  return data;
}

export async function setCatalogProductImage(
  db: SupabaseClient,
  id: string,
  file: { buffer: Buffer; filename: string; mimetype: string },
): Promise<CatalogProductRow> {
  const extension = file.filename.split(".").pop() ?? "jpg";
  const storagePath = `${id}/${Date.now()}.${extension}`;

  const { error: uploadError } = await db.storage
    .from("product-images")
    .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: true });

  if (uploadError) throw new Error(`Falha ao enviar imagem: ${uploadError.message}`);

  const { data: publicUrl } = db.storage.from("product-images").getPublicUrl(storagePath);

  const { data, error } = await db
    .from("catalog_products")
    .update({ image_url: publicUrl.publicUrl })
    .eq("id", id)
    .select(CATALOG_PRODUCT_COLUMNS)
    .maybeSingle();

  if (error) throw new Error(`Falha ao salvar imagem do produto: ${error.message}`);
  if (!data) throw new CatalogProductNotFoundError(`Produto não encontrado: ${id}`);
  return data;
}
