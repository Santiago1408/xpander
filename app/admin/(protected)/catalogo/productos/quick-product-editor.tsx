"use client";

import MediaImage from "../../../../media-image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ChipRow, EmptyState, FileField, Feedback, PageHeader, Pill, formatBOB, ui } from "../../../admin-ui";
import { identifierFromName } from "../../../identifier";
import TrashActions, { type TrashRef } from "../../papelera/trash-actions";

type Media = { id: number; kind?: "image" | "video"; url: string; altText: string; isDeleted?: boolean; purpose?: "photo" | "qr" | "logo" };
type Branch = { id: number; name: string };
type Stock = { branchId: number; variantId: number; quantity: number };
type Inventory = { branches: Branch[]; stock: Stock[] };
type Options = { styles: string[]; audiences: string[]; colors: string[] };
type Brand = { id: number; name: string; productCount: number };
type StoredVariant = {
  id: number; code: string; sizeAlpha: string; sizeNumeric: string; priceMinor: number;
  compareAtPriceMinor: number | null; isActive: boolean; isDeleted: boolean;
};
type StoredProduct = {
  id: number; code: string; revision: number; slug: string; name: string; description: string;
  style: string; audience: string; color: string; brandId: number;
  status: "draft" | "active" | "archived"; isFeatured: boolean; isDeleted: boolean;
  variants: StoredVariant[]; media: Media[];
};
type StockEntry = { key: string; branchId: number; quantity: string; cost: string };
type DraftVariant = {
  key: string; id: number; code: string; sizeAlpha: string; sizeNumeric: string;
  regular: string; offer: string; stockEntries: StockEntry[]; isActive: boolean;
};
type Draft = {
  id: number; requestKey: string; code: string; revision: number; slug: string; name: string;
  description: string; style: string; audience: string; color: string; brandId: number;
  status: "draft" | "active" | "archived"; isFeatured: boolean;
  media: Media[]; variants: DraftVariant[];
};

const statusLabel = { active: "Activo", draft: "Borrador", archived: "Archivado" } as const;

function upper(value: string) { return value.toLocaleUpperCase("es-BO"); }

function moneyInput(minor: number) {
  return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
}

function parseBOB(value: string): number | null {
  if (!/^\d{1,7}(?:[.,]\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().replace(",", ".").split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(result) && result <= 1_000_000_000 ? result : null;
}

function blankVariant(): DraftVariant {
  return { key: crypto.randomUUID(), id: 0, code: "", sizeAlpha: "", sizeNumeric: "",
    regular: "", offer: "", stockEntries: [], isActive: true };
}

function blankDraft(): Draft {
  return { id: 0, requestKey: crypto.randomUUID(), code: "", revision: 0, slug: "", name: "",
    description: "", style: "", audience: "", color: "", brandId: 0, status: "active",
    isFeatured: false, media: [], variants: [blankVariant()] };
}

function toDraft(item: StoredProduct): Draft {
  const variants = item.variants.filter((variant) => !variant.isDeleted);
  return { id: item.id, requestKey: "", code: item.code, revision: item.revision,
    slug: item.slug, name: item.name, description: item.description, style: item.style,
    audience: item.audience, color: item.color, brandId: item.brandId,
    status: item.status, isFeatured: item.isFeatured, media: [...item.media],
    variants: variants.length ? variants.map((variant) => ({
      key: String(variant.id), id: variant.id, code: variant.code,
      sizeAlpha: variant.sizeAlpha, sizeNumeric: variant.sizeNumeric,
      regular: moneyInput(variant.compareAtPriceMinor ?? variant.priceMinor),
      offer: variant.compareAtPriceMinor === null ? "" : moneyInput(variant.priceMinor),
      stockEntries: [], isActive: variant.isActive,
    })) : [blankVariant()] };
}

function Suggestions({ id, values }: { id: string; values: string[] }) {
  return <datalist id={id}>{values.map((value) => <option key={value} value={value} />)}</datalist>;
}

export default function QuickProductEditor() {
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || "");
  const [statusFilter, setStatusFilter] = useState("all");
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const [products, setProducts] = useState<StoredProduct[]>([]);
  const [options, setOptions] = useState<Options | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [library, setLibrary] = useState<Media[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selectedMediaId, setSelectedMediaId] = useState(0);
  const [altText, setAltText] = useState("");
  const [identifierEdited, setIdentifierEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [trashed, setTrashed] = useState<TrashRef | null>(null);

  async function refresh() {
    const paths = ["/api/admin/catalog/products", "/api/admin/catalog/suggestions",
      "/api/admin/catalog/brands", "/api/admin/inventory", "/api/admin/media"];
    const responses = await Promise.all(paths.map((path) => fetch(path, { cache: "no-store" })));
    if (responses.some((response) => !response.ok)) throw new Error("No se pudieron cargar los datos del producto.");
    const [nextProducts, nextOptions, nextBrands, nextInventory, nextLibrary] = await Promise.all(
      responses.map((response) => response.json()));
    setProducts(nextProducts as StoredProduct[]);
    setOptions(nextOptions as Options);
    setBrands(nextBrands as Brand[]);
    setInventory(nextInventory as Inventory);
    setLibrary(nextLibrary as Media[]);
    return nextProducts as StoredProduct[];
  }

  useEffect(() => {
    void (async () => { try { await refresh(); } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo cargar el formulario.");
    } })();
  }, []);

  function changeDraft(changes: Partial<Draft>) {
    setDraft((current) => current && { ...current, ...changes });
  }

  function changeVariant(key: string, changes: Partial<DraftVariant>) {
    setDraft((current) => current && { ...current, variants: current.variants.map((variant) =>
      variant.key === key ? { ...variant, ...changes } : variant) });
  }

  function changeEntry(variant: DraftVariant, entryKey: string, changes: Partial<StockEntry>) {
    changeVariant(variant.key, { stockEntries: variant.stockEntries.map((entry) =>
      entry.key === entryKey ? { ...entry, ...changes } : entry) });
  }

  async function trash(path: string, item: TrashRef) {
    if (busy) return;
    setBusy(true); setError(""); setNotice(""); setTrashed(null);
    try {
      const response = await fetch(path, { method: "DELETE" });
      if (!response.ok) throw new Error((await response.text()).trim() || "No se pudo enviar a la papelera.");
      const next = await refresh();
      const current = next.find((product) => product.id === draft?.id);
      setDraft(current && !current.isDeleted ? toDraft(current) : null);
      setTrashed(item);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo enviar a la papelera.");
    } finally { setBusy(false); }
  }

  async function uploadImage(file: File) {
    if (!draft || busy || draft.media.length >= 12) return;
    setBusy(true); setError("");
    try {
      const body = new FormData();
      body.append("file", file); body.append("altText", altText || draft.name);
      const response = await fetch("/api/admin/media", { method: "POST", body });
      if (!response.ok) throw new Error((await response.text()).trim() || "No se pudo subir la imagen.");
      const media = (await response.json()) as Media;
      changeDraft({ media: [...draft.media, media] });
      const libraryResponse = await fetch("/api/admin/media", { cache: "no-store" });
      if (libraryResponse.ok) setLibrary((await libraryResponse.json()) as Media[]);
      setAltText(""); setNotice("Imagen subida. Guarda la ficha para asociarla.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo subir la imagen.");
    } finally { setBusy(false); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || busy) return;
    setError(""); setNotice(""); setTrashed(null);
    const variants = [];
    for (const variant of draft.variants) {
      const regularPriceMinor = parseBOB(variant.regular);
      const offerPriceMinor = variant.offer.trim() ? parseBOB(variant.offer) : null;
      if ((!variant.sizeAlpha.trim() && !variant.sizeNumeric.trim()) || regularPriceMinor === null ||
        regularPriceMinor <= 0 || (variant.offer.trim() && (offerPriceMinor === null || offerPriceMinor >= regularPriceMinor))) {
        setError("Cada variante necesita una talla alfabética o numérica y precios válidos."); return;
      }
      const stockEntries = [];
      for (const entry of variant.stockEntries) {
        const quantity = Number(entry.quantity);
        const unitCostMinor = parseBOB(entry.cost);
        if (entry.branchId <= 0 || !Number.isInteger(quantity) || quantity <= 0 ||
          quantity > 1_000_000 || unitCostMinor === null) {
          setError("Cada entrada de stock necesita sucursal, cantidad y costo de compra."); return;
        }
        stockEntries.push({ branchId: entry.branchId, quantity, unitCostMinor });
      }
      variants.push({ id: variant.id, sizeAlpha: variant.sizeAlpha, sizeNumeric: variant.sizeNumeric,
        regularPriceMinor, offerPriceMinor, isActive: variant.isActive, stockEntries });
    }
    setBusy(true);
    try {
      const response = await fetch(draft.id ? `/api/admin/catalog/quick/products/${draft.id}` : "/api/admin/catalog/quick/products", {
        method: draft.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestKey: draft.requestKey, revision: draft.revision,
          slug: draft.id === 0 && !identifierEdited ? "" : draft.slug,
          name: draft.name, description: draft.description, style: draft.style,
          audience: draft.audience, color: draft.color, brandId: draft.brandId,
          status: draft.status, isFeatured: draft.isFeatured,
          mediaIds: draft.media.map((image) => image.id), variants }),
      });
      if (!response.ok) throw new Error((await response.text()).trim() || "No se pudo guardar el producto.");
      const saved = (await response.json()) as { id: number };
      const next = await refresh();
      const current = next.find((product) => product.id === saved.id);
      if (current) setDraft(toDraft(current));
      setIdentifierEdited(true);
      setNotice("Producto, tallas y entradas de stock guardados. Los códigos se generaron automáticamente.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo guardar el producto.");
    } finally { setBusy(false); }
  }

  const liveProducts = products.filter((item) => !item.isDeleted);
  const filteredProducts = useMemo(() => {
    const text = query.trim().toLocaleUpperCase("es-BO");
    return products.filter((item) => !item.isDeleted &&
      (statusFilter === "all" || (statusFilter === "featured" ? item.isFeatured : item.status === statusFilter)) &&
      (!text || `${item.code} ${item.name} ${item.color} ${item.style} ${item.audience} ${brands.find((brand) => brand.id === item.brandId)?.name || ""} ${
        item.variants.map((variant) => variant.code).join(" ")}`.toLocaleUpperCase("es-BO").includes(text)));
  }, [products, brands, query, statusFilter]);

  // "+ Nuevo producto" in the top bar opens a blank form through ?nuevo=<timestamp>.
  const nuevo = params.get("nuevo");
  if (nuevo && nuevo !== openedFor && options && inventory) {
    setOpenedFor(nuevo);
    setDraft(blankDraft()); setIdentifierEdited(false); setError(""); setNotice(""); setTrashed(null);
  }

  return productScreen();

  // Plain render helpers (not components) so inputs keep focus while typing.
  function productScreen() {
    if (!options || !inventory) return <p className="text-sm text-graphite">{error || "Cargando productos…"}</p>;
    return draft ? productForm() : productList();
  }

  function openProduct(item: StoredProduct | null) {
    setDraft(item ? toDraft(item) : blankDraft()); setIdentifierEdited(Boolean(item));
    setError(""); setNotice(""); setTrashed(null);
    window.scrollTo({ top: 0 });
  }

  function productList() {
    const visible = filteredProducts;
    return <>
      <PageHeader actions={<>
        <Link className={ui.secondary} href="/admin/catalogo/valores">Marcas, estilos y público</Link>
        <button className={ui.primary} disabled={busy} onClick={() => openProduct(null)} type="button">+ Nuevo producto</button>
      </>} description="Registra cada producto con sus tallas, precios, imágenes y stock inicial. Cada color es un producto distinto."
        eyebrow="Catálogo · Productos" title="Productos" />
      <Feedback error={error} notice={notice} />
      {trashed && <TrashActions item={trashed} notice onChanged={() => window.location.reload()} />}
      <section className="bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <label className="flex h-11 w-full items-center gap-2 border border-line px-3 focus-within:border-ink sm:h-10 sm:w-auto sm:min-w-[220px] sm:max-w-sm sm:flex-1">
            <svg aria-hidden="true" className="size-4 text-graphite" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
            <span className="sr-only">Buscar productos</span>
            <input autoFocus={Boolean(query)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" onChange={(event) => setQuery(event.target.value)}
              placeholder="Nombre, código, marca o color" type="search" value={query} />
          </label>
          <ChipRow className="w-full sm:w-auto" label="Filtrar por estado">
            {[["all", "Todos"], ["active", "Activos"], ["draft", "Borradores"], ["archived", "Archivados"], ["featured", "Destacados"]].map(([value, label]) =>
              <button aria-pressed={statusFilter === value} className={`${ui.chip(statusFilter === value)} shrink-0`} key={value}
                onClick={() => setStatusFilter(value)} type="button">{label}</button>)}
          </ChipRow>
          <span className="font-mono text-xs text-graphite sm:ml-auto">{visible.length} de {liveProducts.length}</span>
        </div>
        {liveProducts.length === 0 ? <div className="p-6"><EmptyState>Aún no hay productos. Crea el primero con «+ Nuevo producto».</EmptyState></div> :
          visible.length === 0 ? <p className="p-6 text-sm text-graphite">No hay productos con esta búsqueda o filtro.</p> :
          <><ul className="m-0 list-none p-0 md:hidden">{visible.map((item) => {
            const variants = item.variants.filter((variant) => !variant.isDeleted);
            const prices = variants.map((variant) => variant.priceMinor);
            const units = inventory!.stock.filter((row) => variants.some((variant) => variant.id === row.variantId)).reduce((sum, row) => sum + row.quantity, 0);
            return <li className="border-t border-mist first:border-0" key={item.id}>
              <button className="flex w-full items-start gap-3 p-4 text-left" onClick={() => openProduct(item)} type="button">
                <span className="relative aspect-[3/4] w-16 shrink-0 overflow-hidden bg-mist">
                  {item.media[0] && <MediaImage alt="" className="absolute inset-0 h-full w-full object-cover" height={85} sizes="64px" src={item.media[0].url} width={64} />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-sm font-semibold leading-snug">{item.name}</span>
                  <span className="text-xs text-graphite"><span className="font-mono">{item.code}</span>{[item.style, item.color].filter(Boolean).map((value) => ` · ${value}`).join("")}</span>
                  <span className="flex flex-wrap items-center gap-1.5 pt-1">
                    <Pill tone={item.status === "active" ? "solid" : item.status === "draft" ? "dashed" : "soft"}>{statusLabel[item.status]}</Pill>
                    {item.isFeatured && <Pill tone="outline">Destacado</Pill>}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-mono text-sm">{prices.length ? formatBOB(Math.min(...prices)) : "—"}</span>
                  <span className={`font-mono text-xs ${units <= 3 ? "text-red-700" : "text-graphite"}`}>{units} u.</span>
                  <span className="font-mono text-[11px] text-graphite">{variants.length} talla(s)</span>
                </span>
              </button>
            </li>;
          })}</ul>
          <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[760px] border-collapse text-sm">
            <thead><tr><th className={ui.th}>Producto</th><th className={ui.th}>Tallas</th><th className={`${ui.th} text-right`}>Precio</th>
              <th className={`${ui.th} text-right`}>Stock</th><th className={ui.th}>Estado</th><th className={ui.th}><span className="sr-only">Acciones</span></th></tr></thead>
            <tbody>{visible.map((item) => {
              const variants = item.variants.filter((variant) => !variant.isDeleted);
              const prices = variants.map((variant) => variant.priceMinor);
              const units = inventory!.stock.filter((row) => variants.some((variant) => variant.id === row.variantId))
                .reduce((sum, row) => sum + row.quantity, 0);
              return <tr className="hover:bg-soft" key={item.id}>
                <td className={ui.td}>
                  <button className="flex items-center gap-3 text-left" onClick={() => openProduct(item)} type="button">
                    <span className="relative size-12 shrink-0 overflow-hidden bg-mist">
                      {item.media[0] && <MediaImage alt="" className="absolute inset-0 h-full w-full object-cover" height={48} sizes="48px" src={item.media[0].url} width={48} />}
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="font-medium hover:underline">{item.name}</span>
                      <span className="text-xs text-graphite"><span className="font-mono">{item.code}</span>{[item.style, item.audience, item.color,
                        brands.find((brand) => brand.id === item.brandId)?.name].filter(Boolean).map((value) => ` · ${value}`).join("")}</span>
                    </span>
                  </button>
                </td>
                <td className={`${ui.td} font-mono text-xs`}>{variants.map((variant) => [variant.sizeAlpha, variant.sizeNumeric].filter(Boolean).join("/")).join(", ") || "—"}</td>
                <td className={`${ui.td} whitespace-nowrap text-right font-mono`}>{prices.length ? formatBOB(Math.min(...prices)) +
                  (Math.max(...prices) > Math.min(...prices) ? ` – ${formatBOB(Math.max(...prices))}` : "") : "—"}</td>
                <td className={`${ui.td} text-right font-mono ${units <= 3 ? "text-red-700" : ""}`}>{units}</td>
                <td className={ui.td}><span className="flex flex-wrap gap-1.5">
                  <Pill tone={item.status === "active" ? "solid" : item.status === "draft" ? "dashed" : "soft"}>{statusLabel[item.status]}</Pill>
                  {item.isFeatured && <Pill tone="outline">Destacado</Pill>}
                </span></td>
                <td className={`${ui.td} text-right`}><button className={ui.quiet} onClick={() => openProduct(item)} type="button">Editar</button></td>
              </tr>;
            })}</tbody>
          </table></div></>}
      </section>
    </>;
  }

  function productForm() {
    const current = draft!;
    // Landing videos stay out of product photos.
    const libraryChoices = library.filter((item) => !item.isDeleted && item.kind !== "video" && item.purpose !== "qr" && item.purpose !== "logo" && !current.media.some((used) => used.id === item.id));
    return <>
      <div className="flex flex-col gap-3">
        <button className="self-start text-sm font-medium text-graphite hover:text-ink" disabled={busy}
          onClick={() => { setDraft(null); setError(""); setNotice(""); }} type="button">← Volver a productos</button>
        <PageHeader actions={current.id > 0 && current.status === "active" && current.slug ?
          <Link className={ui.secondary} href={`/catalogo/${current.slug}`} target="_blank">Ver en la tienda ↗</Link> : undefined}
          eyebrow={current.id ? `Producto · Código ${current.code}` : "Producto · Nuevo"} title={current.id ? current.name || "Producto" : "Nuevo producto"} />
      </div>
      <Feedback error={error} notice={notice} />
      {trashed && <TrashActions item={trashed} notice onChanged={() => window.location.reload()} />}
      <form className="grid items-start grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]" onSubmit={(event) => void save(event)}>
        <fieldset className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0" disabled={busy}>
          <section className={`${ui.card} ${ui.cardPad}`}>
            <h2 className={ui.cardTitle}>Información</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className={ui.label}>Nombre *
                <input className={ui.input} maxLength={120} onChange={(event) => changeDraft({
                  name: upper(event.target.value),
                  slug: current.id === 0 && !identifierEdited ? identifierFromName(event.target.value) : current.slug,
                })} required value={current.name} />
              </label>
              <label className={ui.label}>Identificador para la URL{current.id > 0 ? " *" : ""}
                <input className={`${ui.input} font-mono`} maxLength={64} minLength={2} onChange={(event) => {
                  setIdentifierEdited(true); changeDraft({ slug: event.target.value.toLowerCase() });
                }} pattern="[a-z][a-z0-9_-]+" required={current.id > 0} value={current.slug} />
                <span className={ui.hint}>{current.id ? `/catalogo/${current.slug || "…"}` : "Se genera desde el nombre; puedes corregirlo."}</span>
              </label>
              <label className={`${ui.label} md:col-span-2`}>Descripción (opcional)
                <textarea className={ui.textarea} maxLength={10000} onChange={(event) => changeDraft({ description: event.target.value })}
                  rows={4} value={current.description} />
              </label>
              <label className={ui.label}>Estilo
                <select className={ui.input} onChange={(event) => changeDraft({ style: event.target.value })} value={current.style}>
                  <option value="">Sin estilo</option>
                  {options!.styles.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label className={ui.label}>Público
                <select className={ui.input} onChange={(event) => changeDraft({ audience: event.target.value })} value={current.audience}>
                  <option value="">Sin público</option>
                  {options!.audiences.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label className={ui.label}>Color
                <input className={ui.input} list="color-suggestions" maxLength={120}
                  onChange={(event) => changeDraft({ color: upper(event.target.value) })}
                  placeholder="NEGRO" value={current.color} />
                <Suggestions id="color-suggestions" values={options!.colors} />
              </label>
              <label className={ui.label}>Marca
                <select className={ui.input} onChange={(event) => changeDraft({ brandId: Number(event.target.value) })} value={current.brandId}>
                  <option value={0}>Sin marca</option>
                  {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
                </select>
              </label>
            </div>
            <p className={`${ui.hint} mt-4`}>Los estilos, públicos y marcas se administran en <Link className="underline" href="/admin/catalogo/valores">su apartado</Link>. Cada color se registra como un producto distinto.</p>
          </section>

          <section className={`${ui.card} ${ui.cardPad}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className={ui.cardTitle}>Imágenes</h2>
              <span className="font-mono text-xs text-graphite">{current.media.length} / 12 · la primera es la principal</span>
            </div>
            {current.media.length > 0 && <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {current.media.map((media, index) => <div className="flex flex-col gap-2" key={media.id}>
                <div className="relative aspect-[3/4] overflow-hidden bg-mist">
                  <MediaImage alt={media.altText} className="absolute inset-0 h-full w-full object-cover" height={400}
                    sizes="(max-width: 640px) 50vw, 200px" src={media.url} width={300} />
                  {index === 0 && <span className="absolute left-2 top-2 bg-white px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em]">Principal</span>}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex gap-1">
                    <button aria-label="Mover antes" className={ui.quiet} disabled={index === 0} onClick={() => {
                      const media = [...current.media]; [media[index - 1], media[index]] = [media[index], media[index - 1]]; changeDraft({ media });
                    }} type="button">←</button>
                    <button aria-label="Mover después" className={ui.quiet} disabled={index === current.media.length - 1} onClick={() => {
                      const media = [...current.media]; [media[index + 1], media[index]] = [media[index], media[index + 1]]; changeDraft({ media });
                    }} type="button">→</button>
                  </span>
                  <button className={ui.dangerLink} onClick={() => changeDraft({
                    media: current.media.filter((item) => item.id !== media.id),
                  })} type="button">Quitar</button>
                </div>
              </div>)}
            </div>}
            <div className="mt-5 grid gap-4 border-t border-line pt-5 md:grid-cols-2">
              <div className="flex flex-col gap-3">
                <label className={ui.label}>Texto alternativo de la nueva imagen
                  <input className={ui.input} maxLength={200} onChange={(event) => setAltText(event.target.value)} placeholder={current.name || "Describe la imagen"} value={altText} />
                </label>
                <FileField accept="image/png,image/jpeg,image/webp" disabled={current.media.length >= 12 || busy}
                  hint="PNG, JPEG o WebP de hasta 8 MiB" label="Subir imagen" onFile={(file) => { if (file) void uploadImage(file); }} />
              </div>
              <div className="flex flex-col gap-3">
                <label className={ui.label}>O elegir del banco de imágenes
                  <select className={ui.input} onChange={(event) => setSelectedMediaId(Number(event.target.value))} value={selectedMediaId}>
                    <option value={0}>Selecciona una imagen</option>
                    {libraryChoices.map((item) => <option key={item.id} value={item.id}>{item.altText || `Imagen ${item.id}`}</option>)}
                  </select>
                </label>
                <button className={`${ui.secondary} self-start`} disabled={!selectedMediaId || current.media.length >= 12}
                  onClick={() => {
                    const image = library.find((item) => item.id === selectedMediaId && !item.isDeleted);
                    if (image) changeDraft({ media: [...current.media, image] });
                    setSelectedMediaId(0);
                  }} type="button">Agregar imagen</button>
              </div>
            </div>
          </section>

          <section className={`${ui.card} ${ui.cardPad}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className={ui.cardTitle}>Tallas, precios e inventario</h2>
                <p className={`${ui.hint} mt-1`}>Cada variante necesita talla alfabética, numérica o ambas. Puedes cargar stock en varias sucursales.</p>
              </div>
              <button className={ui.secondary} disabled={current.variants.length >= 99}
                onClick={() => changeDraft({ variants: [...current.variants, blankVariant()] })} type="button">+ Agregar variante</button>
            </div>
            <div className="mt-5 flex flex-col gap-3">
              {current.variants.map((variant, index) => {
                const stockText = inventory!.stock.filter((stock) => stock.variantId === variant.id).map((stock) => {
                  const branch = inventory!.branches.find((item) => item.id === stock.branchId);
                  return `${branch?.name || stock.branchId}: ${stock.quantity}`;
                }).join(" · ") || "0";
                return <div className={`border p-4 ${variant.isActive ? "border-line" : "border-dashed border-[#d0d0d0] bg-soft"}`} key={variant.key}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="m-0 flex items-center gap-2 text-sm font-semibold">Variante {index + 1}
                      <span className="font-mono text-xs font-normal text-graphite">{variant.code || "código al guardar"}</span></h3>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-[13px]"><input checked={variant.isActive} className="size-4 accent-ink"
                        onChange={(event) => changeVariant(variant.key, { isActive: event.target.checked })} type="checkbox" /> Activa</label>
                      {current.variants.length > 1 && <button className={ui.dangerLink} onClick={() => {
                        if (variant.id) void trash(`/api/admin/catalog/variants/${variant.id}`,
                          { kind: "variant", id: variant.id, label: variant.code });
                        else changeDraft({ variants: current.variants.filter((item) => item.key !== variant.key) });
                      }} type="button">{variant.id ? "Enviar a papelera" : "Quitar"}</button>}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <label className={ui.label}>Talla alfabética
                      <input className={`${ui.input} font-mono`} maxLength={40} onChange={(event) => changeVariant(variant.key,
                        { sizeAlpha: upper(event.target.value) })} placeholder="M, XL, S/M…" value={variant.sizeAlpha} />
                    </label>
                    <label className={ui.label}>Talla numérica
                      <input className={`${ui.input} font-mono`} maxLength={40} onChange={(event) => changeVariant(variant.key,
                        { sizeNumeric: upper(event.target.value) })} placeholder="38, 40…" value={variant.sizeNumeric} />
                    </label>
                    <label className={ui.label}>Precio normal (Bs) *
                      <input className={`${ui.input} font-mono`} inputMode="decimal" onChange={(event) => changeVariant(variant.key,
                        { regular: event.target.value })} placeholder="120.00" required value={variant.regular} />
                    </label>
                    <label className={ui.label}>Precio de oferta (Bs)
                      <input className={`${ui.input} font-mono`} inputMode="decimal" onChange={(event) => changeVariant(variant.key,
                        { offer: event.target.value })} placeholder="Opcional" value={variant.offer} />
                    </label>
                  </div>
                  <p className={`${ui.hint} mt-2`}>Al menos una talla es obligatoria. La oferta debe ser menor que el precio normal.</p>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-mist pt-3">
                    <p className="m-0 text-[13px] font-medium">{variant.id ? "Nuevas entradas de stock" : "Stock inicial"}
                      {variant.id > 0 && <span className="ml-2 font-mono text-xs font-normal text-graphite">Existencias: {stockText}</span>}</p>
                    <button className={ui.link} disabled={variant.stockEntries.length >= inventory!.branches.length}
                      onClick={() => changeVariant(variant.key, { stockEntries: [...variant.stockEntries,
                        { key: crypto.randomUUID(), branchId: 0, quantity: "", cost: "" }] })}
                      type="button">+ Agregar sucursal</button>
                  </div>
                  {variant.stockEntries.map((entry) => <div className="mt-3 grid gap-3 bg-soft p-3 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end" key={entry.key}>
                    <label className={ui.label}>Sucursal *
                      <select className={ui.input} onChange={(event) => changeEntry(variant, entry.key,
                        { branchId: Number(event.target.value) })} required value={entry.branchId}>
                        <option value={0}>Selecciona una sucursal</option>
                        {inventory!.branches.filter((branch) => branch.id === entry.branchId ||
                          !variant.stockEntries.some((other) => other.key !== entry.key && other.branchId === branch.id))
                          .map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                      </select>
                    </label>
                    <label className={ui.label}>Unidades *
                      <input className={`${ui.input} font-mono`} min={1} onChange={(event) => changeEntry(variant, entry.key,
                        { quantity: event.target.value })} required step={1} type="number" value={entry.quantity} />
                    </label>
                    <label className={ui.label}>Costo/u. (Bs) *
                      <input className={`${ui.input} font-mono`} inputMode="decimal" onChange={(event) => changeEntry(variant, entry.key,
                        { cost: event.target.value })} required value={entry.cost} />
                    </label>
                    <button className={`${ui.dangerLink} pb-3`} onClick={() => changeVariant(variant.key,
                      { stockEntries: variant.stockEntries.filter((item) => item.key !== entry.key) })}
                      type="button">Quitar</button>
                  </div>)}
                </div>;
              })}
            </div>
          </section>
        </fieldset>

        <aside className="flex flex-col gap-4 xl:sticky xl:top-6">
          <section className={`${ui.card} ${ui.cardPad} flex flex-col gap-4`}>
            <h2 className={ui.cardTitle}>Publicación</h2>
            <label className={ui.label}>Estado *
              <select className={ui.input} disabled={busy} onChange={(event) => changeDraft({ status: event.target.value as Draft["status"] })}
                value={current.status}>
                <option value="active">Activo: visible en la tienda</option>
                <option value="draft">Borrador</option>
                <option value="archived">Archivado</option>
              </select>
            </label>
            <label className="flex items-start gap-2.5 text-sm"><input checked={current.isFeatured} className="mt-0.5 size-4 accent-ink" disabled={busy}
              onChange={(event) => changeDraft({ isFeatured: event.target.checked })} type="checkbox" />
              <span>Destacado<span className={`${ui.hint} block`}>Aparece en la sección «Productos destacados» de la landing.</span></span></label>
            <div className="flex flex-col gap-2 border-t border-line pt-4 text-[13px]">
              <div className="flex justify-between"><span className="text-graphite">Variantes</span><span className="font-mono">{current.variants.length}</span></div>
              <div className="flex justify-between"><span className="text-graphite">Imágenes</span><span className="font-mono">{current.media.length}</span></div>
              <div className="flex justify-between"><span className="text-graphite">Entradas de stock nuevas</span>
                <span className="font-mono">{current.variants.reduce((sum, variant) => sum + variant.stockEntries.length, 0)}</span></div>
            </div>
            <button className={`${ui.primary} hidden h-12 w-full xl:inline-flex`} disabled={busy} type="submit">{busy ? "Guardando…" : current.id ? "Guardar cambios" : "Registrar producto"}</button>
            {current.id > 0 && <button className={`${ui.dangerLink} self-start`} disabled={busy}
              onClick={() => void trash(`/api/admin/catalog/products/${current.id}`,
                { kind: "product", id: current.id, label: current.name })} type="button">Enviar producto a papelera</button>}
          </section>
          <p className={`${ui.hint} px-1`}>Producto, variantes, imágenes y entradas de stock se guardan juntos: si algo falla, no se registra nada. Las compras posteriores con otro costo se registran en <Link className="underline" href="/admin/inventario">Inventario</Link>.</p>
        </aside>
        <div className="sticky bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 flex items-center gap-3 border border-line bg-white p-3 shadow-lg lg:bottom-4 xl:hidden">
          <button className={`${ui.primary} flex-1`} disabled={busy} type="submit">{busy ? "Guardando…" : current.id ? "Guardar cambios" : "Registrar producto"}</button>
        </div>
      </form>
    </>;
  }
}
