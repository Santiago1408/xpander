"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { notify } from "../../../toast";
import { FileField, ui } from "../../admin-ui";
import { discountOf, drawPost, loadImage, priceText, templates, trimWhite, whiteVersion, type Assets, type PostData, type TemplateKey } from "./compose";

const sizePresets = ["XS", "S", "M", "L", "XL", "XXL", "36", "38", "40", "42"];

// Bolivianos typed as "150" or "150,50"; returns centavos or null.
function parseBOB(value: string): number | null {
  if (!/^\d{1,7}(?:[.,]\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().replace(",", ".").split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export default function Generator() {
  const [name, setName] = useState("");
  const [meta, setMeta] = useState("");
  const [code, setCode] = useState("");
  const [sizes, setSizes] = useState<string[]>([]);
  const [customSize, setCustomSize] = useState("");
  const [price, setPrice] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [compare, setCompare] = useState("");
  const [template, setTemplate] = useState<TemplateKey>("ficha");
  const [photo, setPhoto] = useState<HTMLCanvasElement | null>(null);
  const [photoName, setPhotoName] = useState("");
  const [assets, setAssets] = useState<Assets | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [wordmark, mark] = await Promise.all([loadImage("/api/brand/logotipo"), loadImage("/api/brand/isotipo")]);
        const styles = getComputedStyle(document.documentElement);
        const sans = styles.getPropertyValue("--font-archivo").trim() || "system-ui, sans-serif";
        const mono = styles.getPropertyValue("--font-plex-mono").trim() || "monospace";
        await Promise.all([document.fonts.load(`600 72px ${sans}`), document.fonts.load(`400 24px ${mono}`), document.fonts.load(`500 24px ${mono}`)]).catch(() => undefined);
        setAssets({ wordmark, wordmarkWhite: whiteVersion(wordmark), mark, sans, mono });
      } catch { notify.error("No se pudo preparar el logo para el generador."); }
    })();
  }, []);

  async function loadUploadedPhoto(file: File | null) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      setPhoto(trimWhite(await loadImage(url)));
      setPhotoName(file.name);
      notify.success("Foto lista. Se recortó el margen blanco.");
    } catch { notify.error("No se pudo leer la imagen. Usa PNG, JPEG o WebP."); }
    finally { URL.revokeObjectURL(url); }
  }

  function toggleSize(size: string) {
    setSizes((current) => current.includes(size) ? current.filter((item) => item !== size) : [...current, size]);
  }

  function addCustomSize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = customSize.split(/[,;]+/).map((value) => value.trim().toLocaleUpperCase("es-BO")).filter(Boolean);
    if (!values.length) return;
    setSizes((current) => [...current, ...values.filter((value) => !current.includes(value))].slice(0, 12));
    setCustomSize("");
  }

  const priceMinor = parseBOB(price);
  const priceMaxMinor = priceMax.trim() ? parseBOB(priceMax) : null;
  const compareMinor = compare.trim() ? parseBOB(compare) : null;
  const priceError = price.trim() && priceMinor === null ? "Escribe el precio como 150 o 150,50." :
    priceMax.trim() && (priceMaxMinor === null || (priceMinor !== null && priceMaxMinor <= priceMinor)) ? "El precio máximo debe ser mayor que el mínimo." :
    !priceMax.trim() && compare.trim() && (compareMinor === null || (priceMinor !== null && compareMinor <= priceMinor)) ? "El precio anterior debe ser mayor que el precio actual." : "";

  // Nothing is required: an image with only the photo and the XPANDER logos is valid.
  const data: PostData = useMemo(() => {
    const base = priceError ? null : priceMinor;
    return { name: name.trim(), meta: meta.trim(), code: code.trim(), sizes, priceMinor: base,
      priceMaxMinor: base !== null && priceMaxMinor && priceMaxMinor > base ? priceMaxMinor : null,
      compareMinor: base !== null && !priceMaxMinor && compareMinor && compareMinor > base ? compareMinor : null };
  }, [name, meta, code, sizes, priceMinor, priceMaxMinor, compareMinor, priceError]);

  useEffect(() => {
    if (canvas.current && assets) drawPost(canvas.current, template, data, photo, assets);
  }, [assets, data, photo, template]);

  function download() {
    if (!canvas.current) return;
    canvas.current.toBlob((blob) => {
      if (!blob) { notify.error("No se pudo generar el PNG."); return; }
      const slug = data.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "imagen";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `xpander-${slug}-${template}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify.success(`Imagen ${link.download} descargada.`);
    }, "image/png");
  }

  const spec = templates.find((item) => item.key === template)!;
  const step = "flex size-6 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-xs text-white";

  return <div className="grid items-start grid-cols-1 gap-4 xl:grid-cols-[400px_minmax(0,1fr)]">
    <div className="flex min-w-0 flex-col gap-4">
      <section className={`${ui.card} ${ui.cardPad} flex flex-col gap-3`}>
        <h2 className={`${ui.cardTitle} flex items-center gap-2.5`}><span className={step}>1</span>Foto con fondo blanco</h2>
        <FileField accept="image/png,image/jpeg,image/webp" fileName={photoName} hint="PNG, JPEG o WebP. No se sube al servidor."
          label="Elegir foto" onFile={(file) => void loadUploadedPhoto(file)} />
        <p className="m-0 text-xs leading-relaxed text-graphite">Funciona mejor con la prenda sobre fondo blanco liso: el margen blanco se recorta solo y, en la plantilla C, el fondo se funde con el gris.</p>
      </section>

      <section className={`${ui.card} ${ui.cardPad} flex flex-col gap-4`}>
        <h2 className={`${ui.cardTitle} flex items-center gap-2.5`}><span className={step}>2</span>Información</h2>
        <p className="m-0 text-xs leading-relaxed text-graphite">Todo es opcional: lo que dejes vacío no aparece en la imagen.</p>
        <label className={ui.label}>Nombre del producto
          <input className={ui.input} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Short deportivo rojo" value={name} />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
          <label className={ui.label}>Línea descriptiva
            <input className={ui.input} maxLength={60} onChange={(event) => setMeta(event.target.value)} placeholder="Deportiva · Mujer" value={meta} />
          </label>
          <label className={ui.label}>Código
            <input className={`${ui.input} font-mono`} maxLength={12} onChange={(event) => setCode(event.target.value)} placeholder="Opcional" value={code} />
          </label>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium">Tallas disponibles</span>
          <div className="flex flex-wrap gap-1.5">
            {[...sizePresets, ...sizes.filter((size) => !sizePresets.includes(size))].map((size) => {
              const selected = sizes.includes(size);
              return <button aria-pressed={selected} className={`h-10 min-w-11 border px-2.5 font-mono text-sm ${selected ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-ink"}`}
                key={size} onClick={() => toggleSize(size)} type="button">{size}</button>;
            })}
          </div>
          <form className="flex gap-2" onSubmit={addCustomSize}>
            <input aria-label="Otra talla" className={`${ui.input} font-mono`} maxLength={30} onChange={(event) => setCustomSize(event.target.value)}
              placeholder="Otra talla (ej. S/M, 44, Única)" value={customSize} />
            <button className={ui.secondary} disabled={!customSize.trim()} type="submit">Agregar</button>
          </form>
          {sizes.length > 0 && <span className="text-xs text-graphite">En la imagen: {sizes.join(" · ")}</span>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className={ui.label}>Precio (Bs)
            <input className={`${ui.input} font-mono`} inputMode="decimal" onChange={(event) => setPrice(event.target.value)} placeholder="150" value={price} />
          </label>
          <label className={ui.label}>Hasta (Bs)
            <input className={`${ui.input} font-mono`} inputMode="decimal" onChange={(event) => setPriceMax(event.target.value)} placeholder="Para un rango" value={priceMax} />
          </label>
        </div>
        <label className={ui.label}>Precio anterior (Bs)
          <input className={`${ui.input} font-mono`} disabled={Boolean(priceMax.trim())} inputMode="decimal" onChange={(event) => setCompare(event.target.value)}
            placeholder={priceMax.trim() ? "No aplica a un rango" : "Opcional, para ofertas"} value={priceMax.trim() ? "" : compare} />
          <span className={ui.hint}>Se muestra tachado junto al porcentaje de descuento.</span>
        </label>
        {priceError && <p className="m-0 text-xs text-red-700" role="alert">{priceError}</p>}
      </section>

      <section className={`${ui.card} ${ui.cardPad} flex flex-col gap-3`}>
        <h2 className={`${ui.cardTitle} flex items-center gap-2.5`}><span className={step}>3</span>Plantilla</h2>
        <div className="grid gap-2">
          {templates.map((item) => <button aria-pressed={template === item.key} className={`flex flex-col gap-0.5 border p-3 text-left ${template === item.key ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-ink"}`}
            key={item.key} onClick={() => setTemplate(item.key)} type="button">
            <span className="text-sm font-semibold">{item.name}{item.key === "oferta" && discountOf(data) > 0 ? " · recomendada" : ""}</span>
            <span className={`text-xs ${template === item.key ? "text-[#bdbdbd]" : "text-graphite"}`}>{item.hint} {item.width}×{item.height}</span>
          </button>)}
        </div>
      </section>
    </div>

    <section className={`${ui.card} ${ui.cardPad} flex min-w-0 flex-col gap-4 xl:sticky xl:top-6`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5"><h2 className={ui.cardTitle}>Vista previa</h2>
          <span className="font-mono text-xs text-graphite">{spec.name} · {spec.width}×{spec.height} px{priceText(data) ? ` · ${priceText(data)}` : ""}</span></div>
        <button className={ui.primary} disabled={!assets} onClick={download} type="button">Descargar PNG</button>
      </div>
      <div className="flex justify-center bg-soft p-3 sm:p-6">
        {assets ? <canvas aria-label="Vista previa de la imagen" className="h-auto max-h-[72vh] w-auto max-w-full shadow-lg" ref={canvas} role="img"
          style={{ aspectRatio: `${spec.width} / ${spec.height}` }} /> :
          <p className="m-0 py-24 text-center text-sm text-graphite">Preparando el generador…</p>}
      </div>
      {!photo && <p className="m-0 text-xs text-graphite">Aún no elegiste una foto: la vista previa muestra un espacio reservado.</p>}
    </section>
  </div>;
}
