import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { productHref } from "./shop-format";
import { siteUrl } from "./site-url";
import { fetchCatalog } from "./store-data";

// Built on each request so new products appear without rebuilding the site.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const products = (await fetchCatalog()) ?? [];
  return [
    { url: `${siteUrl}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/catalogo`, changeFrequency: "daily", priority: 0.9 },
    ...products.map((product) => ({ url: `${siteUrl}${productHref(product)}`, changeFrequency: "weekly" as const, priority: 0.7 })),
    { url: `${siteUrl}/privacidad`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
