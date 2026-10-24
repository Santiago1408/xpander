"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";

type Category = { id: number; slug: string; name: string; description: string; isActive: boolean };
type Brand = { id: number; slug: string; name: string; isActive: boolean };
type Option = { id: number; attributeDefinitionId: number; value: string; colorHex: string; isActive: boolean };
type Attribute = { id: number; code: string; name: string; scope: "product" | "variant"; isActive: boolean; options: Option[] };
type Vocabulary = { categories: Category[]; brands: Brand[]; attributes: Attribute[] };

type Save = (path: string, method: "POST" | "PUT", body: object) => Promise<boolean>;

const inputClass = "mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm";
const buttonClass = "rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50";

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm md:p-7">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function CategoryRow({ item, busy, save }: { item: Category; busy: boolean; save: Save }) {
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description);
  const [isActive, setIsActive] = useState(item.isActive);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await save(`/api/admin/catalog/categories/${item.id}`, "PUT", { name, description, isActive });
  }
  return (
    <form className="grid gap-3 rounded-xl border border-zinc-200 p-4 md:grid-cols-[1fr_1.5fr_auto] md:items-end"
      onSubmit={(event) => void submit(event)}>
      <label className="text-sm">Nombre
        <input className={inputClass} maxLength={120} onChange={(event) => setName(event.target.value)} required value={name} />
      </label>
      <label className="text-sm">Descripción
        <input className={inputClass} maxLength={1000} onChange={(event) => setDescription(event.target.value)} value={description} />
      </label>
      <div className="flex items-center gap-3 md:pb-1">
        <label className="flex items-center gap-2 text-sm">
          <input checked={isActive} onChange={(event) => setIsActive(event.target.checked)} type="checkbox" /> Activa
        </label>
        <button className={buttonClass} disabled={busy} type="submit">Guardar</button>
      </div>
      <p className="text-xs text-zinc-500 md:col-span-3">Identificador: {item.slug}</p>
    </form>
  );
}

function BrandRow({ item, busy, save }: { item: Brand; busy: boolean; save: Save }) {
  const [name, setName] = useState(item.name);
  const [isActive, setIsActive] = useState(item.isActive);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await save(`/api/admin/catalog/brands/${item.id}`, "PUT", { name, isActive });
  }
  return (
    <form className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 p-4"
      onSubmit={(event) => void submit(event)}>
      <label className="min-w-44 flex-1 text-sm">Nombre
        <input className={inputClass} maxLength={120} onChange={(event) => setName(event.target.value)} required value={name} />
      </label>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <input checked={isActive} onChange={(event) => setIsActive(event.target.checked)} type="checkbox" /> Activa
      </label>
      <button className={buttonClass} disabled={busy} type="submit">Guardar</button>
      <span className="w-full text-xs text-zinc-500">Identificador: {item.slug}</span>
    </form>
  );
}

function OptionRow({ item, busy, save }: { item: Option; busy: boolean; save: Save }) {
  const [value, setValue] = useState(item.value);
  const [colorHex, setColorHex] = useState(item.colorHex);
  const [isActive, setIsActive] = useState(item.isActive);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await save(`/api/admin/catalog/options/${item.id}`, "PUT", { value, colorHex, isActive });
  }
  return (
    <form className="flex flex-wrap items-end gap-3 border-t border-zinc-100 py-3"
      onSubmit={(event) => void submit(event)}>
      <label className="min-w-40 flex-1 text-sm">Valor
        <input className={inputClass} maxLength={120} onChange={(event) => setValue(event.target.value)} required value={value} />
      </label>
      <label className="w-32 text-sm">Color HEX
        <input className={inputClass} maxLength={7} onChange={(event) => setColorHex(event.target.value)}
          pattern="#[0-9A-Fa-f]{6}" placeholder="#AABBCC" value={colorHex} />
      </label>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <input checked={isActive} onChange={(event) => setIsActive(event.target.checked)} type="checkbox" /> Activa
      </label>
      <button className={buttonClass} disabled={busy} type="submit">Guardar</button>
    </form>
  );
}

function AttributeCard({ item, busy, save }: { item: Attribute; busy: boolean; save: Save }) {
  const [name, setName] = useState(item.name);
  const [isActive, setIsActive] = useState(item.isActive);
  const [newValue, setNewValue] = useState("");
  const [newColor, setNewColor] = useState("");
  async function saveAttribute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await save(`/api/admin/catalog/attributes/${item.id}`, "PUT", { name, isActive });
  }
  async function addOption(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await save(`/api/admin/catalog/attributes/${item.id}/options`, "POST", {
      value: newValue, colorHex: newColor,
    })) {
      setNewValue("");
      setNewColor("");
    }
  }
  return (
    <div className="rounded-xl border border-zinc-200 p-4">
      <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => void saveAttribute(event)}>
        <label className="min-w-44 flex-1 text-sm">Atributo
          <input className={inputClass} maxLength={120} onChange={(event) => setName(event.target.value)} required value={name} />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input checked={isActive} onChange={(event) => setIsActive(event.target.checked)} type="checkbox" /> Activo
        </label>
        <button className={buttonClass} disabled={busy} type="submit">Guardar</button>
      </form>
      <p className="mt-2 text-xs text-zinc-500">
        Código: {item.code} · {item.scope === "variant" ? "Define variantes" : "Describe el producto"}
      </p>
      <div className="mt-4">
        <h3 className="text-sm font-semibold">Opciones</h3>
        {item.options.length === 0 && <p className="mt-2 text-sm text-zinc-500">Todavía no hay opciones.</p>}
        {item.options.map((option) => <OptionRow busy={busy} item={option} key={option.id} save={save} />)}
        <form className="mt-3 flex flex-wrap items-end gap-3 rounded-lg bg-zinc-50 p-3"
          onSubmit={(event) => void addOption(event)}>
          <label className="min-w-40 flex-1 text-sm">Nueva opción
            <input className={inputClass} maxLength={120} onChange={(event) => setNewValue(event.target.value)}
              placeholder="Por ejemplo: M, Azul, Mujer" required value={newValue} />
          </label>
          <label className="w-32 text-sm">Color HEX (opcional)
            <input className={inputClass} maxLength={7} onChange={(event) => setNewColor(event.target.value)}
              pattern="#[0-9A-Fa-f]{6}" placeholder="#AABBCC" value={newColor} />
          </label>
          <button className={buttonClass} disabled={busy} type="submit">Agregar opción</button>
        </form>
      </div>
    </div>
  );
}

export default function VocabularyEditor() {
  const [data, setData] = useState<Vocabulary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [categoryDescription, setCategoryDescription] = useState("");
  const [brandSlug, setBrandSlug] = useState("");
  const [brandName, setBrandName] = useState("");
  const [attributeCode, setAttributeCode] = useState("");
  const [attributeName, setAttributeName] = useState("");
  const [attributeScope, setAttributeScope] = useState<"product" | "variant">("variant");

  async function refresh() {
    const response = await fetch("/api/admin/catalog/vocabulary", { cache: "no-store" });
    if (!response.ok) throw new Error("No se pudieron cargar los datos del catálogo.");
    setData((await response.json()) as Vocabulary);
  }

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/admin/catalog/vocabulary", { cache: "no-store" });
        if (!response.ok) throw new Error("No se pudieron cargar los datos del catálogo.");
        setData((await response.json()) as Vocabulary);
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "No se pudo cargar el catálogo.");
      }
    }
    void load();
  }, []);

  async function save(path: string, method: "POST" | "PUT", body: object): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const detail = (await response.text()).trim();
        throw new Error(detail || `No se pudo guardar (${response.status}).`);
      }
      await refresh();
      setNotice("Cambios guardados.");
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo guardar.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await save("/api/admin/catalog/categories", "POST", {
      slug: categorySlug, name: categoryName, description: categoryDescription,
    })) {
      setCategorySlug(""); setCategoryName(""); setCategoryDescription("");
    }
  }

  async function addBrand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await save("/api/admin/catalog/brands", "POST", { slug: brandSlug, name: brandName })) {
      setBrandSlug(""); setBrandName("");
    }
  }

  async function addAttribute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await save("/api/admin/catalog/attributes", "POST", {
      code: attributeCode, name: attributeName, scope: attributeScope,
    })) {
      setAttributeCode(""); setAttributeName("");
    }
  }

  return (
    <div className="space-y-7">
      {error && <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>}
      {notice && <p className="rounded-lg bg-green-50 p-4 text-sm text-green-800" role="status">{notice}</p>}
      {!data ? <p className="text-zinc-600">Cargando datos…</p> : (
        <>
          <Panel title="Categorías">
            <p className="mt-2 text-sm text-zinc-600">Puedes crear, renombrar y desactivar categorías. El identificador queda fijo.</p>
            <form className="mt-5 grid gap-3 rounded-xl bg-zinc-50 p-4 md:grid-cols-2"
              onSubmit={(event) => void addCategory(event)}>
              <label className="text-sm">Nombre
                <input className={inputClass} maxLength={120} onChange={(event) => setCategoryName(event.target.value)}
                  placeholder="Ropa deportiva" required value={categoryName} />
              </label>
              <label className="text-sm">Identificador
                <input className={inputClass} maxLength={64} minLength={2} onChange={(event) => setCategorySlug(event.target.value)}
                  pattern="[a-z][a-z0-9_-]+" placeholder="ropa-deportiva" required value={categorySlug} />
              </label>
              <label className="text-sm md:col-span-2">Descripción (opcional)
                <input className={inputClass} maxLength={1000} onChange={(event) => setCategoryDescription(event.target.value)}
                  value={categoryDescription} />
              </label>
              <button className={`${buttonClass} md:justify-self-start`} disabled={busy} type="submit">Crear categoría</button>
            </form>
            <div className="mt-5 space-y-3">
              {data.categories.length === 0 && <p className="text-sm text-zinc-500">No hay categorías.</p>}
              {data.categories.map((item) => <CategoryRow busy={busy} item={item} key={item.id} save={save} />)}
            </div>
          </Panel>

          <Panel title="Marcas">
            <form className="mt-5 grid gap-3 rounded-xl bg-zinc-50 p-4 md:grid-cols-2"
              onSubmit={(event) => void addBrand(event)}>
              <label className="text-sm">Nombre
                <input className={inputClass} maxLength={120} onChange={(event) => setBrandName(event.target.value)}
                  placeholder="Nombre de la marca" required value={brandName} />
              </label>
              <label className="text-sm">Identificador
                <input className={inputClass} maxLength={64} minLength={2} onChange={(event) => setBrandSlug(event.target.value)}
                  pattern="[a-z][a-z0-9_-]+" placeholder="mi-marca" required value={brandSlug} />
              </label>
              <button className={`${buttonClass} md:justify-self-start`} disabled={busy} type="submit">Crear marca</button>
            </form>
            <div className="mt-5 space-y-3">
              {data.brands.length === 0 && <p className="text-sm text-zinc-500">No hay marcas.</p>}
              {data.brands.map((item) => <BrandRow busy={busy} item={item} key={item.id} save={save} />)}
            </div>
          </Panel>

          <Panel title="Atributos y opciones">
            <p className="mt-2 text-sm text-zinc-600">
              Un atributo de producto describe toda la prenda, como el público. Uno de variante diferencia
              unidades vendibles, como talla o color. El tipo queda fijo al crearlo.
            </p>
            <form className="mt-5 grid gap-3 rounded-xl bg-zinc-50 p-4 md:grid-cols-3"
              onSubmit={(event) => void addAttribute(event)}>
              <label className="text-sm">Nombre
                <input className={inputClass} maxLength={120} onChange={(event) => setAttributeName(event.target.value)}
                  placeholder="Talla" required value={attributeName} />
              </label>
              <label className="text-sm">Código
                <input className={inputClass} maxLength={64} minLength={2} onChange={(event) => setAttributeCode(event.target.value)}
                  pattern="[a-z][a-z0-9_-]+" placeholder="talla" required value={attributeCode} />
              </label>
              <label className="text-sm">Uso
                <select className={inputClass} onChange={(event) => setAttributeScope(event.target.value as "product" | "variant")}
                  value={attributeScope}>
                  <option value="variant">Define variantes</option>
                  <option value="product">Describe el producto</option>
                </select>
              </label>
              <button className={`${buttonClass} md:justify-self-start`} disabled={busy} type="submit">Crear atributo</button>
            </form>
            <div className="mt-5 space-y-4">
              {data.attributes.length === 0 && <p className="text-sm text-zinc-500">No hay atributos.</p>}
              {data.attributes.map((item) => <AttributeCard busy={busy} item={item} key={item.id} save={save} />)}
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
