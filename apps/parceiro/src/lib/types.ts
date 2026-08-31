export type PartnerProductWithStock = {
  id: string;
  price_cents: number;
  promotional_price_cents: number | null;
  available: boolean;
  catalog_products: { name: string; brand: string | null } | null;
  inventory: { stock_quantity: number; reserved_quantity: number } | null;
};
