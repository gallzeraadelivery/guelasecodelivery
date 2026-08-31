export type CatalogBrowseRow = {
  catalog_product_id: string;
  name: string;
  brand: string | null;
  description: string | null;
  image_url: string | null;
  category_id: string | null;
  unit: string;
  volume_ml: number | null;
  requires_age_verification: boolean;
  min_price_cents: number | null;
  in_stock: boolean;
};

export type Address = {
  id: string;
  label: string | null;
  address_line: string;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string;
  state: string;
  postal_code: string | null;
  is_default: boolean;
};
