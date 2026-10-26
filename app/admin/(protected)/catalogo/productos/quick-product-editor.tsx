"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { identifierFromName } from "../../../identifier";
import TrashActions, { type TrashRef } from "../../papelera/trash-actions";

type Media = { id: number; url: string; altText: string };
type LibraryMedia = Media & { isDeleted: boolean };
type Term = { id: number; name: string };
type OptionLists = { styles: Term[]; audiences: Term[]; brands: Term[]; colors: Term[] };
type Branch = { id: number; name: string };
type Stock = { branchId: number; variantId: number; quantity: number };
type Inventory = { branches: Branch[]; stock: Stock[] };
type StoredVariant = {
  id: number; code: string; sku: string; size: string; priceMinor: number;
  compareAtPriceMinor: number | null; isActive: boolean; isDeleted: boolean;
};
type StoredProduct = {
  id: number; code: string; revision: number; slug: string; name: string; description: string;
  categoryName: string; audienceName: string; colorName: string; brandName: string;
  status: "draft" | "active" | "archived"; isFeatured: boolean; isDeleted: boolean;
  variants: StoredVariant[]; media: Media[];
};
type DraftVariant = {
  key: string; id: number; code: string; size: string; regular: string; offer: string;
  stockQuantity: string; cost: string; isActive: boolean;
};
type Draft = {
  id: number; requestKey: string; code: string; revision: number; slug: string; name: string;
  description: string; style: string; audience: string; color: string; brand: string;
  status: "draft" | "active" | "archived"; isFeatured: boolean;
  media: Media[]; variants: DraftVariant[];
};

const inputClass = "mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm";
const buttonClass = "rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50";

function upper(value: string) {
  return value.toLocaleUpperCase("es-BO");
}

function moneyInput(minor: number) {
  return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
}

function parseBOB(value: string): number | null {
  if (!/^\d{1,7}(?:[.,]\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().replace(",", ".").split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(result) && result <= 1_000_000_000 ? result : null;
}

function blankVariant(size: string): DraftVariant {
  return { key: crypto.randomUUID(), id: 0, code: "", size, regular: "", offer: "",
    stockQuantity: "", cost: "", isActive: true };
}

function blankDraft(): Draft {
  return { id: 0, requestKey: crypto.randomUUID(), code: "", revision: 0, slug: "", name: "",
    description: "", style: "", audience: "", color: "", brand: "", status: "active",
    isFeatured: false, media: [], variants: [blankVariant("ÚNICA")] };
}

function toDraft(item: StoredProduct): Draft {
  const variants = item.variants.filter((variant) => !variant.isDeleted);
  return {
    id: item.id, requestKey: "", code: item.code, revision: item.revision, slug: item.slug,
    name: item.name, description: item.description, style: item.categoryName,
    audience: item.audienceName, color: item.colorName, brand: item.brandName,
    status: item.status, isFeatured: item.isFeatured, media: [...item.media],
    variants: variants.map((variant) => ({
      key: String(variant.id), id: variant.id, code: variant.code,
      size: variants.length === 1 ? "ÚNICA" : variant.size,
      regular: moneyInput(variant.compareAtPriceMinor ?? variant.priceMinor),
      offer: variant.compareAtPriceMinor === null ? "" : moneyInput(variant.priceMinor),
      stockQuantity: "", cost: "", isActive: variant.isActive,
    })),
  };
}

function Suggestions({ id, values }: { id: string; values: Term[] }) {
  return <datalist id={id}>{values.map((value) => <option key={value.id} value={value.name} />)}</datalist>;
}

export default function QuickProductEditor() {
  const [products, setProducts] = useState<StoredProduct[]>([]);
  const [options, setOptions] = useState<OptionLists | null>(null);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [library, setLibrary] = useState<LibraryMedia[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [branchId, setBranchId] = useState(0);
  const [selectedMediaId, setSelectedMediaId] = useState(0);
  const [altText, setAltText] = useState("");
  const [identifierEdited, setIdentifierEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [trashed, setTrashed] = useState<TrashRef | null>(null);

  async function refresh() {
    const responses = await Promise.all([
      fetch("/api/admin/catalog/products", { cache: "no-store" }),
      fetch("/api/admin/catalog/quick/options", { cache: "no-store" }),
      fetch("/api/admin/inventory", { cache: "no-store" }),
      fetch("/api/admin/media", { cache: "no-store" }),
    ]);
    if (responses.some((response) => !response.ok)) throw new Error("No se pudieron cargar los datos del producto.");
    const [nextProducts, nextOptions, nextInventory, nextLibrary] = await Promise.all(responses.map((response) => response.json()));
    setProducts(nextProducts as StoredProduct[]);
    setOptions(nextOptions as OptionLists);
    setInventory(nextInventory as Inventory);
    setLibrary(nextLibrary as LibraryMedia[]);
    const branches = (nextInventory as Inventory).branches;
    setBranchId((current) => current || branches[0]?.id || 0);
    return nextProducts as StoredProduct[];
  }

  useEffect(() => {
    async function load() {
      try {
        const responses = await Promise.all([
          fetch("/api/admin/catalog/products", { cache: "no-store" }),
          fetch("/api/admin/catalog/quick/options", { cache: "no-store" }),
          fetch("/api/admin/inventory", { cache: "no-store" }),
          fetch("/api/admin/media", { cache: "no-store" }),
        ]);
        if (responses.some((response) => !response.ok)) throw new Error("No se pudieron cargar los datos del producto.");
        const [nextProducts, nextOptions, nextInventory, nextLibrary] = await Promise.all(responses.map((response) => response.json()));
        setProducts(nextProducts as StoredProduct[]);
        setOptions(nextOptions as OptionLists);
        setInventory(nextInventory as Inventory);
        setLibrary(nextLibrary as LibraryMedia[]);
        setBranchId((nextInventory as Inventory).branches[0]?.id || 0);
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "No se pudo cargar el formulario.");
      }
    }
    void load();
  }, []);

  function changeDraft(changes: Partial<Draft>) {
    setDraft((current) => current && { ...current, ...changes });
  }

  function changeVariant(key: string, changes: Partial<DraftVariant>) {
    setDraft((current) => current && {
      ...current, variants: current.variants.map((variant) => variant.key === key ? { ...variant, ...changes } : variant),
    });
  }

  function addVariant() {
    if (!draft) return;
    changeDraft({ variants: [...draft.variants.map((variant) =>
      variant.size === "ÚNICA" ? { ...variant, size: "" } : variant), blankVariant("")] });
  }

  async function trash(path: string, item: TrashRef) {
    if (busy) return;
    setBusy(true); setError(""); setNotice(""); setTrashed(null);
    try {
      const response = await fetch(path, { method: "DELETE" });
      if (!response.ok) throw new Error((await response.text()).trim() || "No se pudo enviar a la papelera.");
      const next = await refresh();
      if (item.kind === "product" || item.kind === "variant") {
        const current = next.find((product) => product.id === draft?.id);
        setDraft(current && !current.isDeleted ? toDraft(current) : null);
      } else {
        const deletedStyle = item.kind === "category" && options?.styles.some((term) => term.id === item.id);
        const deletedAudience = item.kind === "category" && options?.audiences.some((term) => term.id === item.id);
        setDraft((current) => current && {
          ...current,
          style: deletedStyle && current.style === item.label ? "" : current.style,
          audience: deletedAudience && current.audience === item.label ? "" : current.audience,
          brand: item.kind === "brand" && current.brand === item.label ? "" : current.brand,
          color: item.kind === "color" && current.color === item.label ? "" : current.color,
        });
      }
      setTrashed(item);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo enviar a la papelera.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadImage(file: File) {
    if (!draft || busy || draft.media.length >= 12) return;
    setBusy(true); setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("altText", altText || draft.name);
      const response = await fetch("/api/admin/media", { method: "POST", body });
      if (!response.ok) throw new Error((await response.text()).trim() || "No se pudo subir la imagen.");
      const media = (await response.json()) as Media;
      changeDraft({ media: [...draft.media, media] });
      const libraryResponse = await fetch("/api/admin/media", { cache: "no-store" });
      if (libraryResponse.ok) setLibrary((await libraryResponse.json()) as LibraryMedia[]);
      setAltText(""); setNotice("Imagen subida. Guarda la ficha para asociarla.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo subir la imagen.");
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || busy) return;
    setError(""); setNotice(""); setTrashed(null);
    const variants = [];
    for (const variant of draft.variants) {
      const regularPriceMinor = parseBOB(variant.regular);
      const offerPriceMinor = variant.offer.trim() ? parseBOB(variant.offer) : null;
      const stockQuantity = variant.stockQuantity.trim() ? Number(variant.stockQuantity) : 0;
      const unitCostMinor = stockQuantity > 0 ? parseBOB(variant.cost) : null;
      if (regularPriceMinor === null || regularPriceMinor <= 0 ||
        (variant.offer.trim() && (offerPriceMinor === null || offerPriceMinor >= regularPriceMinor)) ||
        !Number.isInteger(stockQuantity) || stockQuantity < 0 || stockQuantity > 1_000_000 ||
        (stockQuantity > 0 && unitCostMinor === null)) {
        setError("Revisa los precios, la oferta, el stock y el costo de compra de cada talla.");
        return;
      }
      variants.push({ id: variant.id, size: variant.size, regularPriceMinor,
        offerPriceMinor, stockQuantity, unitCostMinor, isActive: variant.isActive });
    }
    setBusy(true);
    try {
      const response = await fetch(draft.id ? `/api/admin/catalog/quick/products/${draft.id}` : "/api/admin/catalog/quick/products", {
        method: draft.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestKey: draft.requestKey, revision: draft.revision,
          slug: draft.id === 0 && !identifierEdited ? "" : draft.slug,
          name: draft.name, description: draft.description, style: draft.style,
          audience: draft.audience, color: draft.color, brand: draft.brand,
          status: draft.status, isFeatured: draft.isFeatured, branchId,
          mediaIds: draft.media.map((image) => image.id), variants,
        }),
      });
      if (!response.ok) throw new Error((await response.text()).trim() || "No se pudo guardar el producto.");
      const saved = (await response.json()) as { id: number };
      const next = await refresh();
      const current = next.find((product) => product.id === saved.id);
      if (current) setDraft(toDraft(current));
      setIdentifierEdited(true);
      setNotice("Producto, tallas e inventario registrados. Los códigos se generaron automáticamente.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo guardar el producto.");
    } finally {
      setBusy(false);
    }
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
                <input className={inputClass} list="style-suggestions" maxLength={120}
                  onChange={(event) => changeDraft({ style: upper(event.target.value) })}
                  placeholder="CASUAL, DEPORTIVA…" value={draft.style} />
                <Suggestions id="style-suggestions" values={options.styles} />
              </label>
              <label className="text-sm">Público (opcional)
                <input className={inputClass} list="audience-suggestions" maxLength={120}
                  onChange={(event) => changeDraft({ audience: upper(event.target.value) })}
                  placeholder="MUJERES, HOMBRES, NIÑOS…" value={draft.audience} />
                <Suggestions id="audience-suggestions" values={options.audiences} />
              </label>
              <label className="text-sm">Color (opcional)
                <input className={inputClass} list="color-suggestions" maxLength={120}
                  onChange={(event) => changeDraft({ color: upper(event.target.value) })}
                  placeholder="NEGRO" value={draft.color} />
                <Suggestions id="color-suggestions" values={options.colors} />
              </label>
              <label className="text-sm">Marca (opcional)
                <input className={inputClass} list="brand-suggestions" maxLength={120}
                  onChange={(event) => changeDraft({ brand: upper(event.target.value) })}
                  placeholder="NOMBRE DE LA MARCA" value={draft.brand} />
                <Suggestions id="brand-suggestions" values={options.brands} />
              </label>
            </div>
            <p className="mt-3 text-xs text-zinc-500">Puedes elegir una sugerencia o escribir un valor nuevo. El sistema reutilizará valores equivalentes, incluso si cambian acentos, espacios o mayúsculas. Cada color se registra como producto independiente.</p>
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
                <p className="mt-1 text-sm text-zinc-600">Cada talla recibe un código numérico de seis dígitos. Si solo hay una opción, su talla es ÚNICA.</p>
              </div>
              <button className="rounded-lg border border-zinc-300 px-4 py-2 text-sm" disabled={draft.variants.length >= 99}
                onClick={addVariant} type="button">+ Agregar talla</button>
            </div>
            <div className="mt-4 max-w-md">
              <label className="text-sm">Sucursal para registrar stock
                <select className={inputClass} onChange={(event) => setBranchId(Number(event.target.value))} value={branchId}>
                  <option value={0}>Selecciona una sucursal</option>
                  {inventory.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </label>
            </div>
            <div className="mt-5 space-y-4">
              {draft.variants.map((variant, index) => <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4" key={variant.key}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-medium">Talla {index + 1} · código {variant.code || "al guardar"}</h3>
                  {draft.variants.length > 1 && <button className="text-sm text-red-700 underline" onClick={() => {
                    if (variant.id) {
                      void trash(`/api/admin/catalog/variants/${variant.id}`,
                        { kind: "variant", id: variant.id, label: variant.code });
                    } else {
                      const remaining = draft.variants.filter((item) => item.key !== variant.key);
                      changeDraft({ variants: remaining.length === 1 ? [{ ...remaining[0], size: "ÚNICA" }] : remaining });
                    }
                  }} type="button">{variant.id ? "Enviar talla a papelera" : "Quitar talla"}</button>}
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <label className="text-sm">Talla *
                    <input className={inputClass} maxLength={40} onChange={(event) => changeVariant(variant.key,
                      { size: upper(event.target.value) })} readOnly={draft.variants.length === 1}
                      required value={draft.variants.length === 1 ? "ÚNICA" : variant.size} />
                  </label>
                  <label className="text-sm">Precio normal (Bs) *
                    <input className={inputClass} inputMode="decimal" onChange={(event) => changeVariant(variant.key,
                      { regular: event.target.value })} placeholder="120.00" required value={variant.regular} />
                  </label>
                  <label className="text-sm">Precio de oferta (Bs, opcional)
                    <input className={inputClass} inputMode="decimal" onChange={(event) => changeVariant(variant.key,
                      { offer: event.target.value })} value={variant.offer} />
                  </label>
                  <label className="text-sm">{variant.id ? "Nueva entrada de stock" : "Stock inicial"} (unidades)
                    <input className={inputClass} min={0} onChange={(event) => changeVariant(variant.key,
                      { stockQuantity: event.target.value })} step={1} type="number" value={variant.stockQuantity} />
                  </label>
                  <label className="text-sm">Costo de compra por unidad (Bs){Number(variant.stockQuantity) > 0 ? " *" : ""}
                    <input className={inputClass} inputMode="decimal" onChange={(event) => changeVariant(variant.key,
                      { cost: event.target.value })} required={Number(variant.stockQuantity) > 0} value={variant.cost} />
                  </label>
                  <div className="flex items-end gap-2 text-sm">
                    {variant.id > 0 && <p className="mr-auto text-zinc-600">Existencia actual: {inventory.stock
                      .find((stock) => stock.branchId === branchId && stock.variantId === variant.id)?.quantity ?? 0}</p>}
                    <label className="flex items-center gap-2"><input checked={variant.isActive}
                      onChange={(event) => changeVariant(variant.key, { isActive: event.target.checked })}
                      type="checkbox" /> Activa</label>
                  </div>
                </div>
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
        <details className="rounded-xl border border-zinc-200 bg-white p-5">
          <summary className="cursor-pointer text-sm font-medium">Corregir valores de estilo, público, marca o color</summary>
          <p className="mt-3 text-sm text-zinc-600">Enviar un valor a la papelera puede ocultar temporalmente los productos que lo usan. Podrás restaurarlo desde la papelera.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {([
              ["Estilos", options.styles, "category", "/api/admin/catalog/categories"],
              ["Públicos", options.audiences, "category", "/api/admin/catalog/categories"],
              ["Marcas", options.brands, "brand", "/api/admin/catalog/brands"],
              ["Colores", options.colors, "color", "/api/admin/catalog/quick/colors"],
            ] as const).map(([title, values, kind, route]) => <div key={title}>
              <h3 className="text-sm font-semibold">{title}</h3>
              <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto text-sm">
                {values.map((value) => <li className="flex items-center justify-between gap-2" key={value.id}>
                  <span>{value.name}</span>
                  <button className="text-red-700 underline" disabled={busy}
                    onClick={() => void trash(`${route}/${value.id}`, { kind, id: value.id, label: value.name })}
                    type="button">Eliminar</button>
                </li>)}
              </ul>
            </div>)}
          </div>
        </details>
        <div className="sticky bottom-4 flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg">
          <button className={buttonClass} disabled={busy} type="submit">{busy ? "Guardando…" : draft.id ? "Guardar cambios" : "Registrar producto"}</button>
          {draft.id > 0 && <button className="text-sm text-red-700 underline" disabled={busy}
            onClick={() => void trash(`/api/admin/catalog/products/${draft.id}`,
              { kind: "product", id: draft.id, label: draft.name })} type="button">Enviar producto a papelera</button>}
        </div>
      </form>}
  </div>;
}
