import type { CatalogProduct } from "./catalogo/catalog-shop";

export type NavItem = { label: string; href: string };

// Display only: amounts stay integer centavos everywhere else.
export function formatBOB(minor: number): string {
  const whole = Math.floor(minor / 100).toLocaleString("es-BO");
  const cents = minor % 100;
  return cents === 0 ? `Bs. ${whole}` : `Bs. ${whole},${String(cents).padStart(2, "0")}`;
}

export function titleCase(value: string): string {
  return value.toLocaleLowerCase("es-BO").replace(/(^|\s)\p{L}/gu, (letter) => letter.toLocaleUpperCase("es-BO"));
}

function distinct(products: CatalogProduct[], field: "style" | "audience"): string[] {
  return [...new Set(products.map((product) => product[field]).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "es-BO"));
}

export function catalogTerms(products: CatalogProduct[]) {
  return { audiences: distinct(products, "audience"), styles: distinct(products, "style") };
}

export function audienceHref(value: string) {
  return `/catalogo?publico=${encodeURIComponent(value)}`;
}

export function styleHref(value: string) {
  return `/catalogo?estilo=${encodeURIComponent(value)}`;
}

// Public audiences and styles registered in the catalog, as in the design's menu.
export function catalogNav(products: CatalogProduct[]): NavItem[] {
  const { audiences, styles } = catalogTerms(products);
  return [
    ...audiences.map((value) => ({ label: titleCase(value), href: audienceHref(value) })),
    ...styles.map((value) => ({ label: titleCase(value), href: styleHref(value) })),
  ].slice(0, 6);
}

export function brandHref(value: string) {
  return `/catalogo?marca=${encodeURIComponent(value)}`;
}

export function lowestPrice(product: CatalogProduct): number {
  return Math.min(...product.variants.map((variant) => variant.priceMinor));
}

export function hasPriceRange(product: CatalogProduct): boolean {
  return new Set(product.variants.map((variant) => variant.priceMinor)).size > 1;
}

// Largest public discount among the product's variants, if any.
export function discountPercent(product: CatalogProduct): number {
  let best = 0;
  for (const variant of product.variants) {
    if (variant.compareAtPriceMinor && variant.compareAtPriceMinor > variant.priceMinor) {
      best = Math.max(best, Math.round((1 - variant.priceMinor / variant.compareAtPriceMinor) * 100));
    }
  }
  return best;
}

export function productSubtitle(product: CatalogProduct): string {
  return [product.style, product.audience].filter(Boolean).map(titleCase).join(" · ");
}

export function catalogBrands(products: CatalogProduct[]): string[] {
  return [...new Set(products.map((product) => product.brandName).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "es-BO"));
}

export function sizeLabel(variant: CatalogProduct["variants"][number]): string {
  return [variant.sizeAlpha, variant.sizeNumeric].filter(Boolean).join(" / ");
}

export function productHref(product: Pick<CatalogProduct, "slug">): string {
  return `/catalogo/${encodeURIComponent(product.slug)}`;
}

// The color is free text in each product; known names get a representative swatch.
const swatches: [string, string][] = [
  ["AZUL MARINO", "#1f2a3c"], ["VERDE MILITAR", "#4b5320"], ["NEGRO", "#141414"], ["BLANCO", "#ffffff"],
  ["GRIS", "#8a8a8a"], ["PLOMO", "#8a8a8a"], ["CELESTE", "#9cc3e4"], ["AZUL", "#2b4c7e"], ["ROJO", "#b3261e"],
  ["GUINDO", "#6b1e2e"], ["VINO", "#6b1e2e"], ["BORDO", "#6b1e2e"], ["VERDE", "#3f6b3a"], ["OLIVA", "#5a5b45"],
  ["MILITAR", "#4b5320"], ["AMARILLO", "#e5c04a"], ["MOSTAZA", "#c9a227"], ["NARANJA", "#d9772b"],
  ["ROSADO", "#e8a6b8"], ["ROSA", "#e8a6b8"], ["FUCSIA", "#c2185b"], ["MORADO", "#6e4a8e"], ["LILA", "#b39ddb"],
  ["BEIGE", "#cfc6b8"], ["ARENA", "#cfc6b8"], ["CREMA", "#efe6d2"], ["HUESO", "#efe9dc"], ["CAFE", "#6b4a33"],
  ["MARRON", "#6b4a33"], ["CAMEL", "#b08155"], ["DORADO", "#c8a951"], ["PLATEADO", "#c0c0c0"],
];

function plain(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleUpperCase("es-BO");
}

export function colorSwatch(color: string): string | null {
  const name = plain(color);
  return swatches.find(([key]) => name.includes(key))?.[1] ?? null;
}

// The public catalog lists the active branches holding stock, never the quantity.
export function variantInStock(variant: CatalogProduct["variants"][number], branchId?: number): boolean {
  const branches = variant.availableBranchIds ?? [];
  return branchId ? branches.includes(branchId) : branches.length > 0;
}

export function productInStock(product: CatalogProduct): boolean {
  return product.variants.some((variant) => variantInStock(variant));
}

// wa.me link for a phone; 8-digit Bolivian mobile numbers get the 591 country code.
export function whatsappHref(phone: string | undefined): string | null {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `https://wa.me/${digits.length === 8 ? `591${digits}` : digits}`;
}
