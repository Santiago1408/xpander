"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import ProductCard from "../product-card";
import { catalogBrands, colorSwatch, formatBOB, lowestPrice, productInStock, titleCase } from "../shop-format";

export type CatalogProduct = {
  id: number; code: string; slug: string; name: string; description: string; style: string;
  audience: string; color: string; brandName: string; isFeatured: boolean;
  variants: { id: number; code: string; sizeAlpha: string; sizeNumeric: string;
    priceMinor: number; compareAtPriceMinor: number | null; availableBranchIds?: number[] }[];
  media: { id: number; url: string; altText: string }[];
};

const pageSize = 12;
const alphaOrder = ["XXS", "XS", "S", "S/M", "M", "M/L", "L", "L/XL", "XL", "XXL", "XXXL", "2XL", "3XL", "4XL"];
const sortOptions = [
  { value: "", label: "Recomendados" },
  { value: "recientes", label: "Más recientes" },
  { value: "precio-asc", label: "Precio: menor a mayor" },
  { value: "precio-desc", label: "Precio: mayor a menor" },
  { value: "nombre", label: "Nombre (A–Z)" },
];

function distinct(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "es-BO"));
}

function sortSizes(values: string[]) {
  const rank = (value: string) => {
    const alpha = alphaOrder.indexOf(value);
    if (alpha >= 0) return [0, alpha];
    const number = Number.parseFloat(value.replace(",", "."));
    return Number.isFinite(number) ? [1, number] : [2, 0];
  };
  return [...values].sort((a, b) => {
    const [ga, va] = rank(a); const [gb, vb] = rank(b);
    return ga - gb || va - vb || a.localeCompare(b, "es-BO");
  });
}

function productSizes(product: CatalogProduct) {
  return product.variants.flatMap((variant) => [variant.sizeAlpha, variant.sizeNumeric]).filter(Boolean);
}

function count(products: CatalogProduct[], field: "audience" | "brandName" | "color" | "style", value: string) {
  return products.filter((product) => product[field] === value).length;
}

const filterTitle = "font-mono text-[11px] uppercase tracking-[0.1em] text-graphite";

export default function CatalogShop({ products }: { products: CatalogProduct[] }) {
  const params = useSearchParams();
  const audience = params.get("publico") || "";
  const style = params.get("estilo") || "";
  const brand = params.get("marca") || "";
  const color = params.get("color") || "";
  const sizes = (params.get("talla") || "").split(",").filter(Boolean);
  const sort = params.get("orden") || "";
  const query = params.get("q") || "";
  const [filtersOpen, setFiltersOpen] = useState(false);

  const options = useMemo(() => {
    const prices = products.map(lowestPrice);
    return {
      audiences: distinct(products.map((product) => product.audience)),
      styles: distinct(products.map((product) => product.style)),
      brands: catalogBrands(products),
      colors: distinct(products.map((product) => product.color)),
      sizes: sortSizes([...new Set(products.flatMap(productSizes))]),
      minPrice: Math.floor(Math.min(...prices) / 100),
      maxPrice: Math.ceil(Math.max(...prices) / 100),
    };
  }, [products]);
  const priceParam = Number(params.get("precio"));
  const priceLimit = Number.isFinite(priceParam) && priceParam > 0 ? Math.min(priceParam, options.maxPrice) : options.maxPrice;

  // Filters live in the URL so menu links, brand links and reloads keep them.
  function update(changes: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value); else next.delete(key);
    }
    const search = next.toString();
    window.history.replaceState(null, "", `/catalogo${search ? `?${search}` : ""}`);
  }

  const filtered = useMemo(() => {
    const text = query.trim().toLocaleUpperCase("es-BO");
    const result = products.filter((product) =>
      (!audience || product.audience === audience) && (!style || product.style === style) &&
      (!brand || product.brandName === brand) && (!color || product.color === color) &&
      (sizes.length === 0 || productSizes(product).some((size) => sizes.includes(size))) &&
      lowestPrice(product) <= priceLimit * 100 &&
      (!text || `${product.name} ${product.code} ${product.description} ${product.brandName}`.toLocaleUpperCase("es-BO").includes(text)));
    if (sort === "") result.sort((a, b) => Number(productInStock(b)) - Number(productInStock(a)));
    if (sort === "recientes") result.sort((a, b) => b.id - a.id);
    if (sort === "precio-asc") result.sort((a, b) => lowestPrice(a) - lowestPrice(b));
    if (sort === "precio-desc") result.sort((a, b) => lowestPrice(b) - lowestPrice(a));
    if (sort === "nombre") result.sort((a, b) => a.name.localeCompare(b.name, "es-BO"));
    return result;
  }, [products, audience, style, brand, color, sizes, priceLimit, query, sort]);

  const filterKey = params.toString();
  const [limit, setLimit] = useState({ key: filterKey, count: pageSize });
  const shown = limit.key === filterKey ? limit.count : pageSize;
  const visible = filtered.slice(0, shown);
  const activeFilters = [audience, brand, color, ...sizes].filter(Boolean).length + (priceLimit < options.maxPrice ? 1 : 0);
  const title = audience || style || brand || "Catálogo";

  function clearFilters() {
    update({ publico: "", estilo: "", marca: "", color: "", talla: "", precio: "", q: "" });
  }

  const chip = (selected: boolean) => `inline-flex h-10 items-center rounded-full border px-4 text-sm font-medium transition-colors ${
    selected ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-ink"}`;

  return <>
    <section className="xp-container">
      <nav aria-label="Ruta" className="flex gap-2 pt-8 font-mono text-xs text-graphite">
        <Link className="hover:text-ink" href="/">Inicio</Link><span>/</span>
        {title === "Catálogo" ? <span className="text-ink">Catálogo</span> : <>
          <button className="hover:text-ink" onClick={clearFilters} type="button">Catálogo</button><span>/</span>
          <span className="text-ink">{titleCase(title)}</span>
        </>}
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-ink pb-8 pt-10">
        <h1 className="xp-display m-0 text-[clamp(48px,7vw,112px)] leading-[0.9] tracking-[-0.02em] [overflow-wrap:anywhere]">{title}</h1>
        <div className="flex w-full max-w-[380px] flex-col gap-4">
          <label className="flex h-11 items-center gap-2.5 border border-line px-3.5 focus-within:border-ink" htmlFor="buscar">
            <svg aria-hidden="true" className="size-[18px] shrink-0 text-graphite" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
            <span className="sr-only">Buscar por nombre, código o marca</span>
            <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" id="buscar" onChange={(event) => update({ q: event.target.value })}
              placeholder="Buscar por nombre, código o marca" type="search" value={query} />
          </label>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 py-5">
        <div aria-label="Estilo" className="flex flex-wrap gap-2" role="group">
          <button aria-pressed={!style} className={chip(!style)} onClick={() => update({ estilo: "" })} type="button">Todo</button>
          {options.styles.map((value) => <button aria-pressed={style === value} className={chip(style === value)} key={value}
            onClick={() => update({ estilo: style === value ? "" : value })} type="button">{titleCase(value)}</button>)}
        </div>
        <div className="flex items-center gap-3">
          <button aria-expanded={filtersOpen} className="inline-flex h-11 items-center gap-2 border border-line px-4 text-sm font-medium lg:hidden"
            onClick={() => setFiltersOpen(!filtersOpen)} type="button">
            Filtros{activeFilters > 0 && <span className="flex size-5 items-center justify-center rounded-full bg-ink font-mono text-[10px] text-white">{activeFilters}</span>}
          </button>
          <label className="hidden text-[13px] text-graphite sm:block" htmlFor="orden">Ordenar por</label>
          <select aria-label="Ordenar por" className="h-11 border border-line bg-white px-3 text-sm" id="orden"
            onChange={(event) => update({ orden: event.target.value })} value={sort}>
            {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
      </div>
    </section>

    <section className="xp-container flex flex-col items-start gap-12 pb-24 pt-2 lg:flex-row">
      <aside aria-label="Filtros" className={`${filtersOpen ? "flex" : "hidden"} w-full flex-col lg:flex lg:w-[260px] lg:shrink-0`}>
        {options.audiences.length > 0 && <div className="flex flex-col gap-3.5 border-t border-line py-5">
          <span className={filterTitle}>Público</span>
          {options.audiences.map((value) => <label className="flex cursor-pointer items-center gap-2.5 text-sm" key={value}>
            <input checked={audience === value} className="size-[18px] accent-ink" onChange={() => update({ publico: audience === value ? "" : value })} type="checkbox" />
            {titleCase(value)}<span className="ml-auto text-xs text-graphite">{count(products, "audience", value)}</span>
          </label>)}
        </div>}
        {options.brands.length > 0 && <div className="flex flex-col gap-3.5 border-t border-line py-5">
          <span className={filterTitle}>Marca</span>
          {options.brands.map((value) => <label className="flex cursor-pointer items-center gap-2.5 text-sm" key={value}>
            <input checked={brand === value} className="size-[18px] accent-ink" onChange={() => update({ marca: brand === value ? "" : value })} type="checkbox" />
            {value}<span className="ml-auto text-xs text-graphite">{count(products, "brandName", value)}</span>
          </label>)}
        </div>}
        {options.sizes.length > 0 && <div className="flex flex-col gap-3.5 border-t border-line py-5">
          <span className={filterTitle}>Talla</span>
          <div className="grid grid-cols-4 gap-1.5">
            {options.sizes.map((value) => {
              const selected = sizes.includes(value);
              return <button aria-pressed={selected} className={`h-11 border font-mono text-[13px] ${selected ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-ink"}`}
                key={value} onClick={() => update({ talla: (selected ? sizes.filter((size) => size !== value) : [...sizes, value]).join(",") })}
                type="button">{value}</button>;
            })}
          </div>
        </div>}
        {options.colors.length > 0 && <div className="flex flex-col gap-3.5 border-t border-line py-5">
          <span className={filterTitle}>Color</span>
          <div className="flex flex-wrap gap-2.5">
            {options.colors.map((value) => {
              const swatch = colorSwatch(value);
              const selected = color === value;
              return <button aria-label={titleCase(value)} aria-pressed={selected} key={value} title={titleCase(value)}
                className={`size-8 rounded-full border-2 border-white ${selected ? "shadow-[0_0_0_1px_#141414]" : "shadow-[0_0_0_1px_#e2e2e2] hover:shadow-[0_0_0_1px_#5e5e5e]"}`}
                onClick={() => update({ color: selected ? "" : value })}
                style={{ background: swatch ?? "conic-gradient(#141414 0 25%, #8a8a8a 0 50%, #ededed 0 75%, #5e5e5e 0)" }} type="button" />;
            })}
          </div>
          {color && <span className="text-[13px] text-graphite">Color: {titleCase(color)}</span>}
        </div>}
        {options.maxPrice > options.minPrice && <div className="flex flex-col gap-3.5 border-t border-line py-5">
          <span className={filterTitle}>Precio</span>
          <label className="flex justify-between text-sm" htmlFor="precio"><span>Hasta</span><span className="font-mono">{formatBOB(priceLimit * 100)}</span></label>
          <input className="w-full accent-ink" id="precio" max={options.maxPrice} min={options.minPrice} onChange={(event) =>
            update({ precio: Number(event.target.value) >= options.maxPrice ? "" : event.target.value })} type="range" value={priceLimit} />
        </div>}
        <div className="border-t border-line py-5">
          <button className="min-h-11 text-sm font-medium underline underline-offset-4 disabled:text-graphite disabled:no-underline"
            disabled={activeFilters === 0 && !style && !query} onClick={clearFilters} type="button">Limpiar filtros</button>
        </div>
      </aside>

      <div className="flex w-full min-w-0 flex-1 flex-col gap-12">
        {filtered.length === 0 ? <p className="border border-dashed border-line p-12 text-center text-graphite">No hay productos con estos filtros.</p> :
          <div className="grid grid-cols-2 gap-x-3 gap-y-9 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] sm:gap-x-5">
            {visible.map((product) => <ProductCard key={product.id} product={product} />)}
          </div>}
        {filtered.length > 0 && <div className="flex flex-col items-center gap-4">
          <span className="font-mono text-xs text-graphite">Mostrando {visible.length} de {filtered.length}</span>
          <div className="h-0.5 w-[200px] bg-line"><div className="h-0.5 bg-ink" style={{ width: `${(visible.length / filtered.length) * 100}%` }} /></div>
          {visible.length < filtered.length && <button className="xp-btn border border-ink bg-white px-9 text-ink hover:bg-ink hover:text-white"
            onClick={() => setLimit({ key: filterKey, count: shown + pageSize })} type="button">Cargar más</button>}
        </div>}
      </div>
    </section>
  </>;
}
