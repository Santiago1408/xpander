"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

type Option = { id: number; value: string; isActive: boolean };
type Attribute = { id: number; name: string; scope: "product" | "variant"; isActive: boolean; options: Option[] };
type Vocabulary = {
  categories: { id: number; name: string; isActive: boolean }[];
  brands: { id: number; name: string; isActive: boolean }[];
  attributes: Attribute[];
};
type Media = { id: number; url: string; altText: string };
type APITypeVariant = {
  id: number; sku: string; priceMinor: number; compareAtPriceMinor: number | null;
  isActive: boolean; optionIds: number[];
};
type APIProduct = {
  id: number; revision: number; slug: string; name: string; description: string;
  categoryId: number; brandId: number; status: "draft" | "active" | "archived";
  isFeatured: boolean; productOptionIds: number[]; variants: APITypeVariant[]; media: Media[];
};
type DraftVariant = {
  key: string; id: number; sku: string; priceText: string; compareText: string;
  isActive: boolean; optionIds: number[];
};
type DraftProduct = Omit<APIProduct, "variants"> & { variants: DraftVariant[] };

const inputClass = "mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm";
const buttonClass = "rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50";

function minorToInput(value: number) {
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}

function parseBOB(value: string): number | null {
  if (!/^\d{1,7}(?:[.,]\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().replace(",", ".").split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(result) && result <= 1_000_000_000 ? result : null;
}

function blankVariant(): DraftVariant {
  return { key: crypto.randomUUID(), id: 0, sku: "", priceText: "", compareText: "", isActive: true, optionIds: [] };
}

function blankProduct(): DraftProduct {
  return {
    id: 0, revision: 0, slug: "", name: "", description: "", categoryId: 0, brandId: 0,
    status: "draft", isFeatured: false, productOptionIds: [], variants: [blankVariant()], media: [],
  };
}

function toDraft(product: APIProduct): DraftProduct {
  return {
    ...product,
    productOptionIds: [...product.productOptionIds],
    media: [...product.media],
    variants: product.variants.map((variant) => ({
      key: String(variant.id), id: variant.id, sku: variant.sku,
      priceText: minorToInput(variant.priceMinor),
      compareText: variant.compareAtPriceMinor === null ? "" : minorToInput(variant.compareAtPriceMinor),
      isActive: variant.isActive, optionIds: [...variant.optionIds],
    })),
  };
}

function optionsForAttribute(attribute: Attribute, selected: number) {
  return attribute.options.filter((option) => option.isActive || option.id === selected);
}

export default function ProductsEditor() {
  const [vocabulary, setVocabulary] = useState<Vocabulary | null>(null);
  const [products, setProducts] = useState<APIProduct[]>([]);
  const [draft, setDraft] = useState<DraftProduct | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [altText, setAltText] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [vocabularyResponse, productsResponse] = await Promise.all([
          fetch("/api/admin/catalog/vocabulary", { cache: "no-store" }),
          fetch("/api/admin/catalog/products", { cache: "no-store" }),
        ]);
        if (!vocabularyResponse.ok || !productsResponse.ok) throw new Error("No se pudo cargar el catálogo.");
        setVocabulary((await vocabularyResponse.json()) as Vocabulary);
        setProducts((await productsResponse.json()) as APIProduct[]);
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "No se pudo cargar el catálogo.");
      }
    }
    void load();
  }, []);

  function changeProduct(changes: Partial<DraftProduct>) {
    setDraft((current) => current && { ...current, ...changes });
  }

  function changeVariant(index: number, changes: Partial<DraftVariant>) {
    setDraft((current) => {
      if (!current) return current;
      const variants = [...current.variants];
      variants[index] = { ...variants[index], ...changes };
      return { ...current, variants };
    });
  }

  function chooseOption(attribute: Attribute, chosenID: number, currentIDs: number[], update: (ids: number[]) => void) {
    const optionIDs = new Set(attribute.options.map((option) => option.id));
    const next = currentIDs.filter((id) => !optionIDs.has(id));
    if (chosenID > 0) next.push(chosenID);
    update(next);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || busy) return;
    setError(""); setNotice("");
    const variants = [];
    for (const variant of draft.variants) {
      const priceMinor = parseBOB(variant.priceText);
      const compareAtPriceMinor = variant.compareText.trim() === "" ? null : parseBOB(variant.compareText);
      if (priceMinor === null || (variant.compareText.trim() !== "" && compareAtPriceMinor === null)) {
        setError("Escribe precios en bolivianos con hasta dos decimales.");
        return;
      }
      variants.push({
        id: variant.id, sku: variant.sku, priceMinor, compareAtPriceMinor,
        isActive: variant.isActive, optionIds: variant.optionIds,
      });
    }
    setBusy(true);
    try {
      const response = await fetch(draft.id ? `/api/admin/catalog/products/${draft.id}` : "/api/admin/catalog/products", {
        method: draft.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revision: draft.revision, slug: draft.slug, name: draft.name,
          description: draft.description, categoryId: draft.categoryId, brandId: draft.brandId,
          status: draft.status, isFeatured: draft.isFeatured,
          productOptionIds: draft.productOptionIds, variants,
          mediaIds: draft.media.map((image) => image.id),
        }),
      });
      if (!response.ok) {
        const detail = (await response.text()).trim();
        throw new Error(response.status === 409 ? `${detail} Recarga la ficha antes de continuar.` : detail || "No se pudo guardar el producto.");
      }
      const saved = (await response.json()) as { id: number };
      const listResponse = await fetch("/api/admin/catalog/products", { cache: "no-store" });
      if (!listResponse.ok) throw new Error("Producto guardado, pero no se pudo actualizar la lista. Recarga la página.");
      const list = (await listResponse.json()) as APIProduct[];
      setProducts(list);
      const current = list.find((product) => product.id === saved.id);
      if (current) setDraft(toDraft(current));
      setNotice("Producto guardado. Los visitantes solo ven fichas con estado Activo.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadImage(file: File) {
    if (!draft || busy || draft.media.length >= 12) return;
    setBusy(true); setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("altText", altText || draft.name);
      const response = await fetch("/api/admin/media", { method: "POST", body: formData });
      if (!response.ok) throw new Error("No se pudo subir la imagen. Usa PNG/JPEG de hasta 8 MB.");
      const media = (await response.json()) as Media;
      changeProduct({ media: [...draft.media, media] });
      setAltText("");
      setNotice("Imagen cargada. Guarda la ficha para asociarla al producto.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo subir la imagen.");
    } finally {
      setBusy(false);
    }
  }

  if (!vocabulary) return <p className="text-zinc-600">{error || "Cargando productos…"}</p>;

  const productAttributes = vocabulary.attributes.filter((attribute) =>
    attribute.scope === "product" && (attribute.isActive || draft?.productOptionIds.some((id) => attribute.options.some((option) => option.id === id))));
  const variantAttributes = vocabulary.attributes.filter((attribute) =>
    attribute.scope === "variant" && (attribute.isActive || draft?.variants.some((variant) =>
      variant.optionIds.some((id) => attribute.options.some((option) => option.id === id)))));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button className={buttonClass} disabled={busy} onClick={() => { setDraft(blankProduct()); setError(""); setNotice(""); }} type="button">
          + Nuevo producto
        </button>
        <select aria-label="Editar producto" className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          disabled={busy} onChange={(event) => {
            const item = products.find((product) => product.id === Number(event.target.value));
            setDraft(item ? toDraft(item) : null); setError(""); setNotice("");
          }} value={draft?.id || 0}>
          <option value={0}>Selecciona un producto para editar</option>
          {products.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.status}</option>)}
        </select>
        <Link className="text-sm underline" href="/admin/catalogo/vocabulario">Editar categorías y atributos</Link>
        <Link className="text-sm underline" href="/catalogo" target="_blank">Ver catálogo público</Link>
      </div>
      {error && <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>}
      {notice && <p className="rounded-lg bg-green-50 p-4 text-sm text-green-800" role="status">{notice}</p>}
      {!draft ? <p className="rounded-xl border border-dashed border-zinc-300 p-10 text-zinc-600">
        {products.length === 0 ? "Todavía no hay productos. Crea el primero." : "Selecciona una ficha o crea un producto."}
      </p> : (
        <form className="space-y-6" onSubmit={(event) => void save(event)}>
          <fieldset className="space-y-6" disabled={busy}>
            <section className="rounded-xl border border-zinc-200 bg-white p-6">
              <h2 className="text-xl font-semibold">Ficha</h2>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="text-sm">Nombre
                  <input className={inputClass} maxLength={120} onChange={(event) => changeProduct({ name: event.target.value })}
                    required value={draft.name} />
                </label>
                <label className="text-sm">Identificador de URL {draft.id > 0 && "(fijo)"}
                  <input className={inputClass} disabled={draft.id > 0} maxLength={64} minLength={2}
                    onChange={(event) => changeProduct({ slug: event.target.value })}
                    pattern="[a-z][a-z0-9_-]+" placeholder="polera-casual" required value={draft.slug} />
                </label>
                <label className="text-sm">Categoría
                  <select className={inputClass} onChange={(event) => changeProduct({ categoryId: Number(event.target.value) })}
                    required value={draft.categoryId}>
                    <option value={0}>Selecciona una categoría</option>
                    {vocabulary.categories.filter((item) => item.isActive || item.id === draft.categoryId).map((item) =>
                      <option key={item.id} value={item.id}>{item.name}{item.isActive ? "" : " (inactiva)"}</option>)}
                  </select>
                </label>
                <label className="text-sm">Marca (opcional)
                  <select className={inputClass} onChange={(event) => changeProduct({ brandId: Number(event.target.value) })}
                    value={draft.brandId}>
                    <option value={0}>Sin marca</option>
                    {vocabulary.brands.filter((item) => item.isActive || item.id === draft.brandId).map((item) =>
                      <option key={item.id} value={item.id}>{item.name}{item.isActive ? "" : " (inactiva)"}</option>)}
                  </select>
                </label>
                <label className="text-sm">Estado
                  <select className={inputClass} onChange={(event) => changeProduct({ status: event.target.value as DraftProduct["status"] })}
                    value={draft.status}>
                    <option value="draft">Borrador</option>
                    <option value="active">Activo: visible al público</option>
                    <option value="archived">Archivado</option>
                  </select>
                </label>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <input checked={draft.isFeatured} onChange={(event) => changeProduct({ isFeatured: event.target.checked })}
                    type="checkbox" /> Destacado en el catálogo
                </label>
                <label className="text-sm md:col-span-2">Descripción
                  <textarea className={inputClass} maxLength={10000} onChange={(event) => changeProduct({ description: event.target.value })}
                    rows={4} value={draft.description} />
                </label>
              </div>
            </section>

            {productAttributes.length > 0 && <section className="rounded-xl border border-zinc-200 bg-white p-6">
              <h2 className="text-xl font-semibold">Características del producto</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {productAttributes.map((attribute) => {
                  const selected = draft.productOptionIds.find((id) => attribute.options.some((option) => option.id === id)) || 0;
                  return <label className="text-sm" key={attribute.id}>{attribute.name}
                    <select className={inputClass} onChange={(event) => chooseOption(attribute, Number(event.target.value),
                      draft.productOptionIds, (ids) => changeProduct({ productOptionIds: ids }))} value={selected}>
                      <option value={0}>Sin definir</option>
                      {optionsForAttribute(attribute, selected).map((option) =>
                        <option key={option.id} value={option.id}>{option.value}{option.isActive ? "" : " (inactiva)"}</option>)}
                    </select>
                  </label>;
                })}
              </div>
            </section>}

            <section className="rounded-xl border border-zinc-200 bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">Variantes</h2>
                  <p className="mt-1 text-sm text-zinc-600">Cada combinación tiene su SKU y precio en bolivianos.</p>
                </div>
                <button className="rounded-lg border border-zinc-300 px-4 py-2 text-sm" onClick={() => changeProduct({
                  variants: [...draft.variants, blankVariant()],
                })} type="button">+ Variante</button>
              </div>
              <div className="mt-5 space-y-4">
                {draft.variants.map((variant, index) => <div className="rounded-xl border border-zinc-200 p-4" key={variant.key}>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-medium">Variante {index + 1}</h3>
                    {variant.id === 0 && <button className="text-sm text-red-700 underline" onClick={() => changeProduct({
                      variants: draft.variants.filter((item) => item.key !== variant.key),
                    })} type="button">Quitar</button>}
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <label className="text-sm">SKU {variant.id > 0 && "(fijo)"}
                      <input className={inputClass} disabled={variant.id > 0} maxLength={64}
                        onChange={(event) => changeVariant(index, { sku: event.target.value })}
                        pattern="[A-Za-z0-9][A-Za-z0-9._-]*" required value={variant.sku} />
                    </label>
                    <label className="text-sm">Precio de venta (Bs)
                      <input className={inputClass} inputMode="decimal" onChange={(event) => changeVariant(index, { priceText: event.target.value })}
                        placeholder="120.00" required value={variant.priceText} />
                    </label>
                    <label className="text-sm">Precio anterior (Bs, opcional)
                      <input className={inputClass} inputMode="decimal" onChange={(event) => changeVariant(index, { compareText: event.target.value })}
                        value={variant.compareText} />
                    </label>
                    {variantAttributes.map((attribute) => {
                      const selected = variant.optionIds.find((id) => attribute.options.some((option) => option.id === id)) || 0;
                      return <label className="text-sm" key={attribute.id}>{attribute.name} {variant.id > 0 && "(fijo)"}
                        <select className={inputClass} disabled={variant.id > 0} onChange={(event) => chooseOption(attribute,
                          Number(event.target.value), variant.optionIds, (ids) => changeVariant(index, { optionIds: ids }))}
                          value={selected}>
                          <option value={0}>No aplica</option>
                          {optionsForAttribute(attribute, selected).map((option) =>
                            <option key={option.id} value={option.id}>{option.value}{option.isActive ? "" : " (inactiva)"}</option>)}
                        </select>
                      </label>;
                    })}
                    <label className="flex items-end gap-2 pb-2 text-sm">
                      <input checked={variant.isActive} onChange={(event) => changeVariant(index, { isActive: event.target.checked })}
                        type="checkbox" /> Variante activa
                    </label>
                  </div>
                </div>)}
                {draft.variants.length === 0 && <p className="text-sm text-zinc-600">Agrega una variante para publicar el producto.</p>}
              </div>
            </section>

            <section className="rounded-xl border border-zinc-200 bg-white p-6">
              <h2 className="text-xl font-semibold">Imágenes</h2>
              <p className="mt-1 text-sm text-zinc-600">La primera imagen será la principal. Guarda la ficha después de subirla.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {draft.media.map((media) => <div className="rounded-lg border border-zinc-200 p-2" key={media.id}>
                  <Image alt={media.altText} className="aspect-square w-full rounded object-cover" height={300}
                    src={media.url} unoptimized width={300} />
                  <p className="mt-2 truncate text-xs text-zinc-600">{media.altText || `Imagen ${media.id}`}</p>
                  <button className="mt-2 text-sm text-red-700 underline" onClick={() => changeProduct({
                    media: draft.media.filter((item) => item.id !== media.id),
                  })} type="button">Quitar de la ficha</button>
                </div>)}
              </div>
              <div className="mt-5 flex flex-wrap items-end gap-4">
                <label className="text-sm">Texto alternativo
                  <input className={inputClass} maxLength={200} onChange={(event) => setAltText(event.target.value)}
                    placeholder="Describe la imagen" value={altText} />
                </label>
                <label className="text-sm">Subir PNG o JPEG
                  <input accept="image/png,image/jpeg" className="mt-1 block text-sm" disabled={busy || draft.media.length >= 12}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadImage(file);
                      event.target.value = "";
                    }} type="file" />
                </label>
              </div>
            </section>
          </fieldset>
          <div className="sticky bottom-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg">
            <button className={buttonClass} disabled={busy} type="submit">{busy ? "Guardando…" : "Guardar producto"}</button>
            <span className="ml-3 text-sm text-zinc-500">{draft.id ? `Revisión ${draft.revision}` : "Nuevo producto"}</span>
          </div>
        </form>
      )}
    </div>
  );
}
