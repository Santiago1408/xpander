"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import MediaImage from "../../../media-image";
import { mobileDigits } from "../../../shop-format";
import { notify } from "../../../toast";
import { ConfirmDialog, EmptyState, Feedback, formatBOB, ui } from "../../admin-ui";

type Variant = { id: number; code: string; sizeAlpha: string; sizeNumeric: string; priceMinor: number; isActive: boolean; isDeleted: boolean };
type Product = { id: number; code: string; name: string; brandName: string; color: string; isDeleted: boolean; variants: Variant[]; media: { url: string; altText: string }[] };
type Inventory = { branches: { id: number; name: string }[]; stock: { branchId: number; variantId: number; quantity: number }[] };
type Line = { variantId: number; quantity: number };
type Method = "cash" | "qr" | "card";

const methods: [Method, string][] = [["cash", "Efectivo"], ["qr", "QR"], ["card", "Tarjeta"]];
const branchKey = "xpander_sale_branch";

function parseBOB(value: string): number | null {
  if (!/^\d{1,7}(?:[.,]\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().replace(",", ".").split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

const sizeOf = (variant: Variant) => [variant.sizeAlpha, variant.sizeNumeric].filter(Boolean).join(" / ") || variant.code;
const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleUpperCase("es-BO");

// Counter sale: the owner builds the ticket, collects the payment and the API
// records a confirmed "store" order that debits the branch stock at once.
export default function SaleEditor() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [branchId, setBranchId] = useState(0);
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [method, setMethod] = useState<Method>("cash");
  const [discount, setDiscount] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pendingRequest = useRef<{ key: string; payload: string } | null>(null);
  const ticket = useRef<HTMLElement>(null);

  async function loadInventory() {
    const response = await fetch("/api/admin/inventory", { cache: "no-store" });
    if (!response.ok) throw new Error("No se pudo cargar el inventario.");
    return (await response.json()) as Inventory;
  }

  useEffect(() => {
    void (async () => {
      try {
        const [productsResponse, stock] = await Promise.all([fetch("/api/admin/catalog/products", { cache: "no-store" }), loadInventory()]);
        if (!productsResponse.ok) throw new Error("No se pudieron cargar los productos.");
        setProducts(((await productsResponse.json()) as Product[]).filter((product) => !product.isDeleted));
        setInventory(stock);
        let saved = 0;
        try { saved = Number(localStorage.getItem(branchKey)) || 0; } catch {}
        setBranchId(stock.branches.some((branch) => branch.id === saved) ? saved : stock.branches[0]?.id || 0);
      } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo preparar la venta."); }
    })();
  }, []);

  const variants = useMemo(() => new Map((products || []).flatMap((product) =>
    product.variants.filter((variant) => !variant.isDeleted).map((variant) => [variant.id, { product, variant }] as const))), [products]);
  const stockOf = (variantId: number) => inventory?.stock.find((row) => row.branchId === branchId && row.variantId === variantId)?.quantity ?? 0;

  const results = useMemo(() => {
    const text = normalize(query.trim());
    return (products || []).filter((product) => product.variants.some((variant) => !variant.isDeleted) && (!text ||
      normalize(`${product.name} ${product.code} ${product.brandName} ${product.color} ${product.variants.map((variant) => variant.code).join(" ")}`).includes(text)))
      .slice(0, text ? 30 : 12);
  }, [products, query]);

  function chooseBranch(id: number) {
    setBranchId(id);
    try { localStorage.setItem(branchKey, String(id)); } catch {}
    // Stock differs per branch: keep only what the new branch can cover.
    setLines((current) => current.map((line) => ({ ...line, quantity: Math.min(line.quantity, inventory?.stock.find((row) => row.branchId === id && row.variantId === line.variantId)?.quantity ?? 0) }))
      .filter((line) => line.quantity > 0));
  }

  function add(variantId: number) {
    const available = stockOf(variantId);
    const current = lines.find((line) => line.variantId === variantId)?.quantity ?? 0;
    if (current >= available) { notify.info(available ? `Solo hay ${available} u. en esta sucursal.` : "No hay unidades en esta sucursal."); return; }
    setLines(current ? lines.map((line) => line.variantId === variantId ? { ...line, quantity: line.quantity + 1 } : line) : [...lines, { variantId, quantity: 1 }]);
  }

  function setQuantity(variantId: number, quantity: number) {
    setLines((current) => quantity <= 0 ? current.filter((line) => line.variantId !== variantId) :
      current.map((line) => line.variantId === variantId ? { ...line, quantity: Math.min(quantity, stockOf(variantId)) } : line));
  }

  const subtotal = lines.reduce((sum, line) => sum + (variants.get(line.variantId)?.variant.priceMinor ?? 0) * line.quantity, 0);
  const discountMinor = discount.trim() ? parseBOB(discount) : 0;
  const discountError = discountMinor === null ? "Escribe el descuento como 20 o 20,50." : discountMinor > subtotal ? "El descuento no puede superar el subtotal." : "";
  const total = subtotal - (discountMinor || 0);
  const units = lines.reduce((sum, line) => sum + line.quantity, 0);
  const branchName = inventory?.branches.find((branch) => branch.id === branchId)?.name || "";

  async function register() {
    if (busy) return;
    setBusy(true); setError("");
    const body = { branchId, paymentMethod: method, customerName: customerName.trim(), customerPhone: customerPhone.trim(), note: note.trim(),
      discountMinor: discountMinor || 0, items: lines };
    const payload = JSON.stringify(body);
    // A retry of the same ticket reuses its key, so a lost response never records the sale twice.
    if (pendingRequest.current?.payload !== payload) pendingRequest.current = { key: crypto.randomUUID(), payload };
    try {
      const response = await fetch("/api/admin/sales", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestKey: pendingRequest.current.key, ...body }),
      });
      if (!response.ok) throw new Error((await response.text()).trim() || "No se pudo registrar la venta.");
      const sale = (await response.json()) as { number: string; totalMinor: number };
      pendingRequest.current = null;
      setLines([]); setDiscount(""); setCustomerName(""); setCustomerPhone(""); setNote(""); setMethod("cash"); setConfirming(false);
      notify.success(`Venta ${sale.number} registrada por ${formatBOB(sale.totalMinor)}. Se descontó el stock de ${branchName}.`,
        { label: "Ver en pedidos", onClick: () => router.push(`/admin/pedidos?q=${sale.number}`) });
      setInventory(await loadInventory());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo registrar la venta.");
      setConfirming(false);
    } finally { setBusy(false); }
  }

  if (!products || !inventory) return <><Feedback error={error} />{!error && <p className="text-sm text-graphite">Cargando productos e inventario…</p>}</>;
  if (inventory.branches.length === 0) return <EmptyState>Necesitas al menos una sucursal activa para registrar ventas en tienda.</EmptyState>;

  return <div className="flex flex-col gap-4">
    <Feedback error={error} />
    <div className="grid items-start grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
      <section className={`${ui.card} flex min-w-0 flex-col`}>
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:p-5">
          <label className={ui.label}>Sucursal donde se vende
            <select className={ui.input} onChange={(event) => chooseBranch(Number(event.target.value))} value={branchId}>
              {inventory.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
          <label className="flex h-11 items-center gap-2 border border-line px-3 focus-within:border-ink">
            <svg aria-hidden="true" className="size-4 text-graphite" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
            <span className="sr-only">Buscar productos</span>
            <input autoComplete="off" className="min-w-0 flex-1 bg-transparent text-sm outline-none" onChange={(event) => setQuery(event.target.value)}
              placeholder="Nombre, código de producto o de talla, marca" type="search" value={query} />
          </label>
        </div>
        {results.length === 0 ? <p className="m-0 p-5 text-sm text-graphite">No hay productos que coincidan con la búsqueda.</p> :
          <ul className="m-0 flex list-none flex-col p-0">{results.map((product) => <li className="flex gap-3 border-b border-mist p-4 last:border-b-0 sm:gap-4 sm:px-5" key={product.id}>
            <span className="relative size-16 shrink-0 overflow-hidden bg-mist sm:size-20">
              {product.media[0] && <MediaImage alt="" className="absolute inset-0 h-full w-full object-cover" height={80} sizes="80px" src={product.media[0].url} width={80} />}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex flex-col"><span className="text-sm font-medium">{product.name}</span>
                <span className="font-mono text-xs text-graphite">{product.code}{product.brandName ? ` · ${product.brandName}` : ""}</span></div>
              <div className="flex flex-wrap gap-1.5">{product.variants.filter((variant) => !variant.isDeleted).map((variant) => {
                const available = stockOf(variant.id);
                const inTicket = lines.find((line) => line.variantId === variant.id)?.quantity ?? 0;
                return <button aria-label={`Agregar talla ${sizeOf(variant)}, ${formatBOB(variant.priceMinor)}, ${available} en stock`}
                  className={`flex min-w-[68px] flex-col items-start border px-2.5 py-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:border-dashed disabled:text-graphite ${
                    inTicket ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-ink"}`}
                  disabled={available === 0} key={variant.id} onClick={() => add(variant.id)} type="button">
                  <span className="font-mono text-[13px] font-medium">{sizeOf(variant)}{inTicket ? ` · ${inTicket}` : ""}</span>
                  <span className={`font-mono text-[11px] ${inTicket ? "text-[#bdbdbd]" : "text-graphite"}`}>{formatBOB(variant.priceMinor)} · {available} u.</span>
                </button>;
              })}</div>
            </div>
          </li>)}</ul>}
        {!query.trim() && products.length > results.length && <p className="m-0 border-t border-line p-4 text-xs text-graphite sm:px-5">Mostrando {results.length} de {products.length} productos. Busca para encontrar el resto.</p>}
      </section>

      <section className={`${ui.card} flex flex-col xl:sticky xl:top-6`} ref={ticket}>
        <div className="flex items-baseline justify-between border-b border-line px-5 py-4 sm:px-6">
          <h2 className={ui.cardTitle}>Venta en {branchName}</h2>
          <span className="font-mono text-xs text-graphite">{units} u.</span>
        </div>
        {lines.length === 0 ? <p className="m-0 px-5 py-8 text-center text-sm text-graphite sm:px-6">Toca una talla para agregarla a la venta.</p> :
          <ul className="m-0 flex list-none flex-col p-0">{lines.map((line) => {
            const entry = variants.get(line.variantId);
            if (!entry) return null;
            return <li className="flex items-center gap-3 border-b border-mist px-5 py-3 sm:px-6" key={line.variantId}>
              <span className="flex min-w-0 flex-1 flex-col"><span className="truncate text-sm font-medium">{entry.product.name}</span>
                <span className="font-mono text-xs text-graphite">{sizeOf(entry.variant)} · {formatBOB(entry.variant.priceMinor)} c/u</span></span>
              <span className="flex items-center border border-line">
                <button aria-label="Quitar una unidad" className="size-9 text-lg hover:bg-soft" onClick={() => setQuantity(line.variantId, line.quantity - 1)} type="button">−</button>
                <span aria-live="polite" className="w-7 text-center font-mono text-sm">{line.quantity}</span>
                <button aria-label="Agregar una unidad" className="size-9 text-lg hover:bg-soft disabled:opacity-30" disabled={line.quantity >= stockOf(line.variantId)}
                  onClick={() => setQuantity(line.variantId, line.quantity + 1)} type="button">+</button>
              </span>
              <span className="w-[86px] text-right font-mono text-sm">{formatBOB(entry.variant.priceMinor * line.quantity)}</span>
            </li>;
          })}</ul>}

        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-medium">Forma de pago</span>
            <div aria-label="Forma de pago" className="grid grid-cols-3 border border-ink" role="radiogroup">
              {methods.map(([value, label]) => <button aria-checked={method === value} className={`h-11 text-[13px] font-semibold ${method === value ? "bg-ink text-white" : "bg-white hover:bg-soft"}`}
                key={value} onClick={() => setMethod(value)} role="radio" type="button">{label}</button>)}
            </div>
          </div>
          <label className={ui.label}>Descuento (Bs)
            <input className={`${ui.input} font-mono`} inputMode="decimal" onChange={(event) => setDiscount(event.target.value)} placeholder="0" value={discount} />
            {discountError && <span className="text-xs font-normal text-red-700" role="alert">{discountError}</span>}
          </label>
          <details className="group border-t border-line pt-3">
            <summary className="cursor-pointer list-none text-[13px] font-medium marker:hidden">
              <span className="underline underline-offset-4">Cliente y nota</span> <span className="font-normal text-graphite">(opcional)</span></summary>
            <div className="mt-3 flex flex-col gap-3">
              <label className={ui.label}>Nombre<input className={ui.input} maxLength={120} onChange={(event) => setCustomerName(event.target.value)} placeholder="Cliente en tienda" value={customerName} /></label>
              <label className={ui.label}>Celular<input className={`${ui.input} font-mono`} inputMode="numeric" onChange={(event) => setCustomerPhone(mobileDigits(event.target.value))} placeholder="71234567" type="tel" value={customerPhone} /></label>
              <label className={ui.label}>Nota<textarea className={ui.textarea} maxLength={500} onChange={(event) => setNote(event.target.value)} rows={2} value={note} /></label>
            </div>
          </details>
          <dl className="m-0 flex flex-col gap-1.5 border-t border-ink pt-4 text-sm">
            <div className="flex justify-between text-graphite"><dt>Subtotal</dt><dd className="m-0 font-mono">{formatBOB(subtotal)}</dd></div>
            {(discountMinor || 0) > 0 && !discountError && <div className="flex justify-between text-graphite"><dt>Descuento</dt><dd className="m-0 font-mono">−{formatBOB(discountMinor || 0)}</dd></div>}
            <div className="flex items-baseline justify-between"><dt className="font-semibold">Total</dt><dd className="m-0 font-mono text-2xl">{formatBOB(discountError ? subtotal : total)}</dd></div>
          </dl>
          <button className={`${ui.primary} h-12`} disabled={lines.length === 0 || Boolean(discountError) || busy} onClick={() => setConfirming(true)} type="button">Registrar venta</button>
        </div>
      </section>
    </div>

    {lines.length > 0 && <div className="sticky bottom-[calc(1rem+env(safe-area-inset-bottom))] z-20 flex items-center justify-between gap-3 bg-ink p-3 pl-4 text-white shadow-[0_12px_40px_rgba(0,0,0,.28)] xl:hidden">
      <span className="font-mono text-sm">{units} u. · {formatBOB(discountError ? subtotal : total)}</span>
      <button className="h-10 bg-white px-4 text-[13px] font-semibold text-ink" onClick={() => ticket.current?.scrollIntoView({ behavior: "smooth", block: "start" })} type="button">Ir al cobro</button>
    </div>}

    {confirming && <ConfirmDialog busy={busy} confirmLabel="Sí, registrar venta" onCancel={() => setConfirming(false)} onConfirm={() => void register()} title="Registrar venta en tienda">
      <p className="m-0">Se registrará como venta confirmada y se descontarán estas unidades del stock de <strong>{branchName}</strong>:</p>
      <ul className="m-0 flex list-none flex-col gap-1 p-0 font-mono text-xs">
        {lines.map((line) => { const entry = variants.get(line.variantId); return entry && <li className="flex justify-between gap-3" key={line.variantId}>
          <span>{entry.product.name} · {sizeOf(entry.variant)}</span><span>−{line.quantity} u.</span></li>; })}
      </ul>
      <div className="flex items-baseline justify-between bg-soft p-3">
        <span>Cobro en {methods.find(([value]) => value === method)?.[1].toLocaleLowerCase("es-BO")}</span>
        <span className="font-mono text-base">{formatBOB(total)}</span>
      </div>
      {method !== "cash" && <p className="m-0 text-xs text-graphite">Registra la venta solo después de comprobar que el pago {method === "qr" ? "ingresó a tu cuenta" : "con tarjeta fue aprobado"}.</p>}
    </ConfirmDialog>}
  </div>;
}
