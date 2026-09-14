"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAdminSession } from "@/context/session";
import {
  BackendError,
  createCatalogProduct,
  createCategory,
  listCatalogProducts,
  listCategories,
  updateCatalogProduct,
  uploadCatalogProductImage,
  type CatalogProduct,
  type Category,
} from "@/lib/backend";

const EMPTY_FORM = {
  name: "",
  brand: "",
  categoryId: "",
  unit: "un",
  volumeMl: "",
  alcoholContentPct: "",
  requiresAgeVerification: true,
};

export default function CatalogoPage() {
  const { session } = useAdminSession();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [newCategoryName, setNewCategoryName] = useState("");
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(
    async (q?: string) => {
      if (!session) return;
      try {
        const [cats, prods] = await Promise.all([
          listCategories(session.access_token),
          listCatalogProducts(session.access_token, q),
        ]);
        setCategories(cats);
        setProducts(prods);
      } catch (err) {
        setError(err instanceof BackendError ? err.message : "Falha ao carregar catálogo.");
      } finally {
        setLoading(false);
      }
    },
    [session],
  );

  useEffect(() => {
    void load();
  }, [load]);

  function categoryName(id: string | null) {
    return categories.find((c) => c.id === id)?.name ?? "—";
  }

  async function handleCreateCategory() {
    if (!session || !newCategoryName.trim()) return;
    try {
      await createCategory(session.access_token, { name: newCategoryName.trim(), sortOrder: categories.length + 1 });
      setNewCategoryName("");
      await load(search);
    } catch (err) {
      setError(err instanceof BackendError ? err.message : "Falha ao criar categoria.");
    }
  }

  async function handleCreateProduct() {
    if (!session || !form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createCatalogProduct(session.access_token, {
        name: form.name.trim(),
        brand: form.brand.trim() || null,
        description: null,
        categoryId: form.categoryId || null,
        unit: form.unit.trim() || "un",
        volumeMl: form.volumeMl ? Number.parseInt(form.volumeMl, 10) : null,
        alcoholContentPct: form.alcoholContentPct ? Number.parseFloat(form.alcoholContentPct) : null,
        requiresAgeVerification: form.requiresAgeVerification,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load(search);
    } catch (err) {
      setError(err instanceof BackendError ? err.message : "Falha ao criar produto.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(product: CatalogProduct) {
    if (!session) return;
    try {
      await updateCatalogProduct(session.access_token, product.id, { active: !product.active });
      await load(search);
    } catch (err) {
      setError(err instanceof BackendError ? err.message : "Falha ao atualizar produto.");
    }
  }

  async function handleUploadImage(product: CatalogProduct, file: File) {
    if (!session) return;
    setUploadingId(product.id);
    setError(null);
    try {
      await uploadCatalogProductImage(session.access_token, product.id, file);
      await load(search);
    } catch (err) {
      setError(err instanceof BackendError ? err.message : "Falha ao enviar imagem.");
    } finally {
      setUploadingId(null);
    }
  }

  if (loading) return <p className="text-sm text-zinc-600 dark:text-zinc-400">Carregando...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Catálogo mestre</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Base única de produtos — as distribuidoras selecionam daqui pra oferecer, nunca cadastram do zero.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded bg-brand-red px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-red-dark"
        >
          {showForm ? "Cancelar" : "Novo produto"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div>
          <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Buscar produto</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load(search)}
            placeholder="Nome do produto..."
            className="w-56 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <button
          onClick={() => load(search)}
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
        >
          Buscar
        </button>
        <div className="ml-auto flex items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Nova categoria</label>
            <input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Ex: Whisky"
              className="w-40 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <button
            onClick={handleCreateCategory}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
          >
            Adicionar
          </button>
        </div>
      </div>

      {showForm && (
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800 sm:grid-cols-3">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Nome (ex: Heineken Long Neck 330ml)"
            className="col-span-2 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900 sm:col-span-1"
          />
          <input
            value={form.brand}
            onChange={(e) => setForm({ ...form, brand: e.target.value })}
            placeholder="Marca"
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <select
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">Sem categoria</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
            placeholder="Unidade (un, cx...)"
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <input
            value={form.volumeMl}
            onChange={(e) => setForm({ ...form, volumeMl: e.target.value })}
            placeholder="Volume (ml)"
            type="number"
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <input
            value={form.alcoholContentPct}
            onChange={(e) => setForm({ ...form, alcoholContentPct: e.target.value })}
            placeholder="Teor alcoólico (%)"
            type="number"
            step="0.1"
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={form.requiresAgeVerification}
              onChange={(e) => setForm({ ...form, requiresAgeVerification: e.target.checked })}
            />
            Exige verificação de idade
          </label>
          <button
            onClick={handleCreateProduct}
            disabled={saving || !form.name.trim()}
            className="rounded bg-brand-red px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-red-dark disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Criar produto"}
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
              <th className="px-4 py-2">Foto</th>
              <th className="px-4 py-2">Produto</th>
              <th className="px-4 py-2">Categoria</th>
              <th className="px-4 py-2">Ativo</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                  Nenhum produto no catálogo.
                </td>
              </tr>
            )}
            {products.map((product) => (
              <tr key={product.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                <td className="px-4 py-2">
                  {product.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.image_url} alt={product.name} className="h-12 w-12 rounded object-cover" />
                  ) : (
                    <div className="h-12 w-12 rounded bg-zinc-100 dark:bg-zinc-800" />
                  )}
                  <input
                    ref={(el) => {
                      fileInputRefs.current[product.id] = el;
                    }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleUploadImage(product, file);
                      e.target.value = "";
                    }}
                  />
                  <button
                    onClick={() => fileInputRefs.current[product.id]?.click()}
                    disabled={uploadingId === product.id}
                    className="mt-1 block text-xs text-zinc-600 hover:underline disabled:opacity-50 dark:text-zinc-400"
                  >
                    {uploadingId === product.id ? "Enviando..." : "Trocar foto"}
                  </button>
                </td>
                <td className="px-4 py-2 text-black dark:text-zinc-50">
                  {product.name}
                  {product.brand && <span className="ml-1 text-xs text-zinc-500">({product.brand})</span>}
                </td>
                <td className="px-4 py-2 text-black dark:text-zinc-50">{categoryName(product.category_id)}</td>
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    checked={product.active}
                    onChange={() => handleToggleActive(product)}
                  />
                </td>
                <td className="px-4 py-2" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
