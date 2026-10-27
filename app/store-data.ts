import type { CatalogProduct } from "./catalogo/catalog-shop";
import type { PublicBusiness } from "./landing-sections";

export const apiOrigin = process.env.XPANDER_API_ORIGIN ?? "http://127.0.0.1:8080";

export async function optionalJSON<T>(path: string): Promise<T | undefined> {
  try {
    const response = await fetch(`${apiOrigin}${path}`, { cache: "no-store" });
    return response.ok ? ((await response.json()) as T) : undefined;
  } catch { return undefined; }
}

// Public storefront data. A missing catalog is reported as undefined so pages
// can tell "unavailable" apart from "no products yet".
export function fetchCatalog() {
  return optionalJSON<CatalogProduct[]>("/api/catalog/products");
}

export function fetchBusiness() {
  return optionalJSON<PublicBusiness>("/api/business");
}
