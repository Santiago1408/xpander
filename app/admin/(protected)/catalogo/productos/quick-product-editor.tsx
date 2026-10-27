"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { identifierFromName } from "../../../identifier";
import TrashActions, { type TrashRef } from "../../papelera/trash-actions";

type Media = { id: number; url: string; altText: string; isDeleted?: boolean };
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

const inputClass = "mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm";
const buttonClass = "rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50";

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

  if (!options || !inventory) return <p className="text-zinc-600">{error || "Cargando formulario…"}</p>;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center gap-3">
      <button className={buttonClass} disabled={busy} onClick={() => {
        setDraft(blankDraft()); setIdentifierEdited(false); setError(""); setNotice(""); setTrashed(null);
      }} type="button">+ Nuevo producto</button>
      <select aria-label="Editar producto" className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
        disabled={busy} onChange={(event) => {
          const item = products.find((product) => product.id === Number(event.target.value));
          setDraft(item ? toDraft(item) : null); setIdentifierEdited(true); setError(""); setNotice(""); setTrashed(null);
        }} value={draft?.id || 0}>
        <option value={0}>Selecciona un producto para editar</option>
        {products.filter((item) => !item.isDeleted).map((item) => <option key={item.id} value={item.id}>
          {item.code} · {item.name}</option>)}
      </select>
      <Link className="text-sm underline" href="/admin/catalogo/valores">Administrar marcas, estilos y público</Link>
      <Link className="text-sm underline" href="/admin/inventario">Ver inventario</Link>
    </div>
    {error && <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>}
    {notice && <p className="rounded-lg bg-green-50 p-4 text-sm text-green-800" role="status">{notice}</p>}
    {trashed && <TrashActions item={trashed} notice onChanged={() => window.location.reload()} />}
    {!draft ? <p className="rounded-xl border border-dashed border-zinc-300 p-10 text-zinc-600">Crea un producto o selecciona uno existente.</p> :
      <form className="space-y-6" onSubmit={(event) => void save(event)}>
        <fieldset className="space-y-6" disabled={busy}>
          <section className="rounded-xl border border-zinc-200 bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Producto</h2>
              <span className="rounded-lg bg-zinc-100 px-3 py-2 text-sm">Código: {draft.code || "Se generará al guardar"}</span>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm">Nombre *
                <input className={inputClass} maxLength={120} onChange={(event) => changeDraft({
                  name: upper(event.target.value),
                  slug: draft.id === 0 && !identifierEdited ? identifierFromName(event.target.value) : draft.slug,
                })} required value={draft.name} />
              </label>
              <label className="text-sm">Identificador{draft.id > 0 ? " *" : " (generado desde el nombre)"}
                <input className={inputClass} maxLength={64} minLength={2} onChange={(event) => {
                  setIdentifierEdited(true); changeDraft({ slug: event.target.value.toLowerCase() });
                }} pattern="[a-z][a-z0-9_-]+" required={draft.id > 0} value={draft.slug} />
              </label>
              <label className="text-sm md:col-span-2">Descripción (opcional)
                <textarea className={inputClass} maxLength={10000} onChange={(event) => changeDraft({ description: event.target.value })}
                  rows={4} value={draft.description} />
              </label>
              <label className="text-sm">Estilo de ropa (opcional)
                <select className={inputClass} onChange={(event) => changeDraft({ style: event.target.value })} value={draft.style}>
                  <option value="">Sin estilo</option>
                  {options.styles.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label className="text-sm">Público (opcional)
                <select className={inputClass} onChange={(event) => changeDraft({ audience: event.target.value })} value={draft.audience}>
                  <option value="">Sin público</option>
                  {options.audiences.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label className="text-sm">Color (opcional)
                <input className={inputClass} list="color-suggestions" maxLength={120}
                  onChange={(event) => changeDraft({ color: upper(event.target.value) })}
                  placeholder="NEGRO" value={draft.color} />
                <Suggestions id="color-suggestions" values={options.colors} />
              </label>
              <label className="text-sm">Marca (opcional)
                <select className={inputClass} onChange={(event) => changeDraft({ brandId: Number(event.target.value) })}
                  value={draft.brandId}>
                  <option value={0}>Sin marca</option>
                  {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
                </select>
              </label>
            </div>
            <p className="mt-3 text-xs text-zinc-500">Los estilos y públicos se administran en su apartado. El color sigue siendo un texto de la ficha; cada color se registra como producto separado.</p>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-6">
            <h2 className="text-xl font-semibold">Imágenes</h2>
            <p className="mt-1 text-sm text-zinc-600">La primera imagen será la principal.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {draft.media.map((media) => <div className="rounded-lg border border-zinc-200 p-2" key={media.id}>
                <Image alt={media.altText} className="aspect-square w-full rounded object-cover" height={300}
                  src={media.url} unoptimized width={300} />
                <button className="mt-2 text-sm text-red-700 underline" onClick={() => changeDraft({
                  media: draft.media.filter((item) => item.id !== media.id),
                })} type="button">Quitar de la ficha</button>
              </div>)}
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="text-sm">Texto alternativo
                <input className={inputClass} maxLength={200} onChange={(event) => setAltText(event.target.value)} value={altText} />
              </label>
              <label className="text-sm">Subir PNG o JPEG
                <input accept="image/png,image/jpeg" className="mt-1 block text-sm" disabled={draft.media.length >= 12}
                  onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(file); event.target.value = ""; }} type="file" />
              </label>
              <label className="text-sm">Elegir del banco
                <select className={inputClass} onChange={(event) => setSelectedMediaId(Number(event.target.value))} value={selectedMediaId}>
                  <option value={0}>Selecciona una imagen</option>
                  {library.filter((item) => !item.isDeleted && !draft.media.some((used) => used.id === item.id)).map((item) =>
                    <option key={item.id} value={item.id}>{item.altText || `Imagen ${item.id}`}</option>)}
                </select>
              </label>
              <button className="rounded-lg border border-zinc-300 px-4 py-2 text-sm" disabled={!selectedMediaId || draft.media.length >= 12}
                onClick={() => {
                  const image = library.find((item) => item.id === selectedMediaId && !item.isDeleted);
                  if (image) changeDraft({ media: [...draft.media, image] });
                  setSelectedMediaId(0);
                }} type="button">Agregar imagen</button>
            </div>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Tallas, precios e inventario</h2>
                <p className="mt-1 text-sm text-zinc-600">Cada variante necesita talla alfabética, numérica o ambas. Puedes cargar stock en varias sucursales.</p>
              </div>
              <button className="rounded-lg border border-zinc-300 px-4 py-2 text-sm" disabled={draft.variants.length >= 99}
                onClick={() => changeDraft({ variants: [...draft.variants, blankVariant()] })} type="button">+ Agregar variante</button>
            </div>
            <div className="mt-5 space-y-4">
              {draft.variants.map((variant, index) => <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4" key={variant.key}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-medium">Variante {index + 1} · código {variant.code || "al guardar"}</h3>
                  {draft.variants.length > 1 && <button className="text-sm text-red-700 underline" onClick={() => {
                    if (variant.id) void trash(`/api/admin/catalog/variants/${variant.id}`,
                      { kind: "variant", id: variant.id, label: variant.code });
                    else changeDraft({ variants: draft.variants.filter((item) => item.key !== variant.key) });
                  }} type="button">{variant.id ? "Enviar variante a papelera" : "Quitar variante"}</button>}
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <label className="text-sm">Talla alfabética (al menos una talla *)
                    <input className={inputClass} maxLength={40} onChange={(event) => changeVariant(variant.key,
                      { sizeAlpha: upper(event.target.value) })} placeholder="M, XL, S/M…"
                      value={variant.sizeAlpha} />
                  </label>
                  <label className="text-sm">Talla numérica (al menos una talla *)
                    <input className={inputClass} maxLength={40} onChange={(event) => changeVariant(variant.key,
                      { sizeNumeric: upper(event.target.value) })} placeholder="38, 40…"
                      value={variant.sizeNumeric} />
                  </label>
                  <label className="text-sm">Precio normal (Bs) *
                    <input className={inputClass} inputMode="decimal" onChange={(event) => changeVariant(variant.key,
                      { regular: event.target.value })} placeholder="120.00" required value={variant.regular} />
                  </label>
                  <label className="text-sm">Precio de oferta (Bs, opcional)
                    <input className={inputClass} inputMode="decimal" onChange={(event) => changeVariant(variant.key,
                      { offer: event.target.value })} value={variant.offer} />
                  </label>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{variant.id ? "Nuevas entradas de stock" : "Stock inicial"}</p>
                  <button className="text-sm text-blue-800 underline" disabled={variant.stockEntries.length >= inventory.branches.length}
                    onClick={() => changeVariant(variant.key, { stockEntries: [...variant.stockEntries,
                      { key: crypto.randomUUID(), branchId: 0, quantity: "", cost: "" }] })}
                    type="button">+ Agregar sucursal</button>
                </div>
                {variant.stockEntries.map((entry) => <div className="mt-3 grid gap-3 rounded-lg border border-zinc-200 bg-white p-3 md:grid-cols-[2fr_1fr_1fr_auto]" key={entry.key}>
                  <label className="text-sm">Sucursal *
                    <select className={inputClass} onChange={(event) => changeEntry(variant, entry.key,
                      { branchId: Number(event.target.value) })} required value={entry.branchId}>
                      <option value={0}>Selecciona una sucursal</option>
                      {inventory.branches.filter((branch) => branch.id === entry.branchId ||
                        !variant.stockEntries.some((other) => other.key !== entry.key && other.branchId === branch.id))
                        .map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                    </select>
                  </label>
                  <label className="text-sm">Unidades *
                    <input className={inputClass} min={1} onChange={(event) => changeEntry(variant, entry.key,
                      { quantity: event.target.value })} required step={1} type="number" value={entry.quantity} />
                  </label>
                  <label className="text-sm">Costo/u. (Bs) *
                    <input className={inputClass} inputMode="decimal" onChange={(event) => changeEntry(variant, entry.key,
                      { cost: event.target.value })} required value={entry.cost} />
                  </label>
                  <button className="self-end pb-2 text-sm text-red-700 underline" onClick={() => changeVariant(variant.key,
                    { stockEntries: variant.stockEntries.filter((item) => item.key !== entry.key) })}
                    type="button">Quitar</button>
                </div>)}
                {variant.id > 0 && <p className="mt-3 text-xs text-zinc-600">Existencias: {inventory.stock.filter((stock) =>
                  stock.variantId === variant.id).map((stock) => {
                    const branch = inventory.branches.find((item) => item.id === stock.branchId);
                    return `${branch?.name || stock.branchId}: ${stock.quantity}`;
                  }).join(" · ") || "0"}</p>}
                <label className="mt-4 flex items-center gap-2 text-sm"><input checked={variant.isActive}
                  onChange={(event) => changeVariant(variant.key, { isActive: event.target.checked })}
                  type="checkbox" /> Variante activa</label>
              </div>)}
            </div>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-6">
            <h2 className="text-xl font-semibold">Visibilidad</h2>
            <div className="mt-4 flex flex-wrap items-end gap-4">
              <label className="text-sm">Estado *
                <select className={inputClass} onChange={(event) => changeDraft({ status: event.target.value as Draft["status"] })}
                  value={draft.status}>
                  <option value="active">Activo: visible en la tienda</option>
                  <option value="draft">Borrador</option>
                  <option value="archived">Archivado</option>
                </select>
              </label>
              <label className="flex items-center gap-2 pb-2 text-sm"><input checked={draft.isFeatured}
                onChange={(event) => changeDraft({ isFeatured: event.target.checked })}
                type="checkbox" /> Destacado</label>
            </div>
          </section>
        </fieldset>
        <div className="sticky bottom-4 flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg">
          <button className={buttonClass} disabled={busy} type="submit">{busy ? "Guardando…" : draft.id ? "Guardar cambios" : "Registrar producto"}</button>
          {draft.id > 0 && <button className="text-sm text-red-700 underline" disabled={busy}
            onClick={() => void trash(`/api/admin/catalog/products/${draft.id}`,
              { kind: "product", id: draft.id, label: draft.name })} type="button">Enviar producto a papelera</button>}
        </div>
      </form>}
  </div>;
}
