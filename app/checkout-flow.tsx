"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { clearStoredCart, maxCartLines, maxLineQuantity, readStoredCart, writeStoredCart, type CartItem } from "./cart-store";
import type { CatalogProduct } from "./catalogo/catalog-shop";
import MediaImage from "./media-image";
import { BrandPlaceholder } from "./product-card";
import { formatBOB, productHref, sizeLabel, titleCase, variantInStock } from "./shop-format";
import { notify } from "./toast";

type Branch = { id: number; name: string; address: string; instructions: string };
type Receipt = { id: number; number: string; status: string; totalMinor: number; whatsappUrl: string;
  paymentMethod: "whatsapp" | "qr"; paymentStatus: string; deliveryMethod?: "pickup" | "delivery"; accessToken: string };
type Business = { phone: string; qrUrl: string; qrExpiresOn: string };

// Orders awaiting payment follow-up survive reloads and page changes.
const pendingQRKey = "xpander_pending_qr_order_v1";
const steps = ["Carrito", "Datos", "Pago", "WhatsApp"];

function savedQRReceipts(): Receipt[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(pendingQRKey) || "[]") as unknown;
    const values = Array.isArray(raw) ? raw : [raw];
    return values.filter((value): value is Receipt => typeof value === "object" && value !== null &&
      Number.isSafeInteger(value.id) && value.id > 0 && value.paymentMethod === "qr" &&
      typeof value.accessToken === "string" && value.accessToken.length > 0);
  } catch { return []; }
}

function rememberQR(receipt: Receipt | null, removeId?: number): Receipt[] {
  const current = savedQRReceipts().filter((item) => item.id !== (receipt?.id ?? removeId));
  if (receipt) current.push(receipt);
  try { window.localStorage.setItem(pendingQRKey, JSON.stringify(current.slice(-20))); }
  catch { /* The order still exists if browser storage is unavailable. */ }
  return current.slice(-20);
}

function finished(receipt: Receipt) {
  return receipt.status !== "pending" || receipt.paymentStatus === "verified";
}

const field = "h-12 w-full border border-line bg-white px-3.5 text-[15px] outline-none focus:border-ink disabled:bg-soft";

function StepIcon({ index }: { index: number }) {
  const paths = [
    <><rect height="20" rx="2" width="12" x="6" y="2" /><path d="M10 18h4" /><path d="M11 13V9.5a1 1 0 0 1 2 0V12l2 .5a1.5 1.5 0 0 1 1 1.6l-.4 2.4" /></>,
    <><rect height="20" rx="2" width="12" x="6" y="2" /><path d="M9 7h2v2H9zM13 7h2v2h-2zM9 11h2v2H9zM13.5 11.5h1v1h-1z" /></>,
    <><rect height="20" rx="2" width="12" x="6" y="2" /><path d="M9 11.5l2 2 4-4" /></>,
    <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M12 18v-6M9.5 14.5 12 12l2.5 2.5" /></>,
  ];
  return <svg aria-hidden="true" className="size-9 shrink-0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3" viewBox="0 0 24 24">{paths[index]}</svg>;
}

export default function CheckoutFlow({ products, layout, onClose }: {
  products: CatalogProduct[]; layout: "drawer" | "page"; onClose?: () => void;
}) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [step, setStep] = useState<"cart" | "details">("cart");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [pickupBranchId, setPickupBranchId] = useState(0);
  const [deliveryMethod, setDeliveryMethod] = useState<"pickup" | "delivery">("pickup");
  const [paymentMethod, setPaymentMethod] = useState<"whatsapp" | "qr">("whatsapp");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [savedOrders, setSavedOrders] = useState<Receipt[]>([]);
  const [business, setBusiness] = useState<Business | null>(null);
  const [businessChecked, setBusinessChecked] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofBusy, setProofBusy] = useState(false);
  const [proofError, setProofError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [branchError, setBranchError] = useState("");
  const pendingRequest = useRef<{ key: string; payload: string } | null>(null);
  const top = useRef<HTMLDivElement>(null);

  const variantMap = useMemo(() => {
    const map = new Map<number, { product: CatalogProduct; variant: CatalogProduct["variants"][number] }>();
    for (const product of products) for (const variant of product.variants) map.set(variant.id, { product, variant });
    return map;
  }, [products]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = readStoredCart((id) => variantMap.has(id));
      setCart(stored);
      setLoaded(true);
      const saved = savedQRReceipts();
      setSavedOrders(saved);
      // With an empty cart, resume the latest order that still needs follow-up.
      const previous = saved.at(-1);
      if (stored.length > 0 || !previous) return;
      setReceipt(previous);
      void fetch(`/api/orders/${previous.id}/payment`, { cache: "no-store",
        headers: { "X-Order-Token": previous.accessToken } }).then(async (response) => {
          if (!response.ok) return;
          const current = (await response.json()) as { status: string; paymentStatus: string };
          const updated = { ...previous, status: current.status, paymentStatus: current.paymentStatus };
          setReceipt(updated);
          setSavedOrders(finished(updated) ? rememberQR(null, previous.id) : rememberQR(updated));
        }).catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [variantMap]);

  useEffect(() => {
    if (loaded) writeStoredCart(cart);
  }, [cart, loaded]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/pickup-branches", { cache: "no-store" });
        if (!response.ok) throw new Error("No se pudieron cargar las sucursales.");
        const next = (await response.json()) as Branch[];
        setBranches(next);
        setPickupBranchId(next[0]?.id || 0);
      } catch (failure) {
        setBranchError(failure instanceof Error ? failure.message : "No se pudieron cargar las sucursales.");
      }
    })();
    void (async () => {
      try {
        const response = await fetch("/api/business", { cache: "no-store" });
        if (response.ok) setBusiness((await response.json()) as Business);
      } catch { /* Treated as "no QR available". */ }
      finally { setBusinessChecked(true); }
    })();
  }, []);

  const cartLines = cart.flatMap((item) => {
    const found = variantMap.get(item.variantId);
    return found ? [{ ...item, ...found }] : [];
  });
  const units = cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = cartLines.reduce((sum, line) => sum + line.quantity * line.variant.priceMinor, 0);
  const qrAvailable = Boolean(business?.qrUrl);
  // The catalog reports which branches hold each size; the server rechecks quantities.
  const soldOutLines = cartLines.filter((line) => !variantInStock(line.variant));
  const missingAtBranch = (branchId: number) => cartLines.filter((line) => !variantInStock(line.variant, branchId));
  const missingHere = pickupBranchId ? missingAtBranch(pickupBranchId) : [];
  const view = receipt ? (receipt.paymentMethod === "whatsapp" || finished(receipt) ||
    receipt.paymentStatus === "submitted" ? "whatsapp" : "payment") : step;
  const stepIndex = { cart: 0, details: 1, payment: 2, whatsapp: 3 }[view];

  function scrollTop() {
    if (layout === "drawer") top.current?.scrollIntoView({ block: "start" });
    else window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateCart(variantId: number, quantity: number) {
    setError("");
    pendingRequest.current = null;
    setCart((current) => {
      if (quantity <= 0) return current.filter((item) => item.variantId !== variantId);
      if (current.length > maxCartLines || quantity > maxLineQuantity) return current;
      return current.map((item) => item.variantId === variantId ? { variantId, quantity } : item);
    });
  }

  function openOrder(order: Receipt) {
    setReceipt(order); setProofError(""); setProofFile(null); scrollTop();
  }

  function startOver() {
    setReceipt(null); setStep("cart"); setProofError(""); setProofFile(null); scrollTop();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || cartLines.length === 0 || !pickupBranchId || (paymentMethod === "qr" && !qrAvailable)) return;
    setBusy(true); setError("");
    try {
      const data = {
        pickupBranchId, paymentMethod, deliveryMethod, customerName: customerName.trim(),
        customerPhone: customerPhone.trim(), customerNote: customerNote.trim(), items: cartLines.map((line) => ({
          variantId: line.variantId, quantity: line.quantity, expectedUnitPriceMinor: line.variant.priceMinor,
        })),
      };
      const payload = JSON.stringify(data);
      if (pendingRequest.current?.payload !== payload) {
        pendingRequest.current = { key: crypto.randomUUID(), payload };
      }
      const response = await fetch("/api/orders", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestKey: pendingRequest.current.key, ...data }) });
      if (!response.ok) throw new Error((await response.text()).trim() || "No se pudo registrar el pedido.");
      const saved = (await response.json()) as Receipt;
      clearStoredCart();
      setCart([]);
      pendingRequest.current = null;
      setReceipt(saved);
      if (saved.paymentMethod === "qr") setSavedOrders(rememberQR(saved));
      notify.success(saved.paymentMethod === "qr" ?
        `Pedido ${saved.number} registrado. Ahora realiza el pago con el QR.` :
        `Pedido ${saved.number} registrado. Envía el detalle por WhatsApp.`);
      setStep("cart");
      scrollTop();
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "No se pudo registrar el pedido.";
      setError(message); notify.error(message);
    } finally { setBusy(false); }
  }

  async function uploadProof(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!receipt || !proofFile || proofBusy) return;
    setProofBusy(true); setProofError("");
    try {
      const body = new FormData();
      body.append("file", proofFile);
      const response = await fetch(`/api/orders/${receipt.id}/receipt`, { method: "POST",
        headers: { "X-Order-Token": receipt.accessToken }, body });
      if (!response.ok) throw new Error((await response.text()).trim() || "No se pudo subir el comprobante.");
      const result = (await response.json()) as { paymentStatus: string; whatsappUrl: string };
      const updated = { ...receipt, paymentStatus: result.paymentStatus, whatsappUrl: result.whatsappUrl };
      setReceipt(updated);
      setSavedOrders(rememberQR(updated));
      setProofFile(null);
      scrollTop();
      notify.success("Comprobante enviado. Último paso: envía el detalle por WhatsApp.");
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "No se pudo subir el comprobante.";
      setProofError(message); notify.error(message);
    }
    finally { setProofBusy(false); }
  }

  async function refreshPayment() {
    if (!receipt) return;
    setProofError("");
    try {
      const response = await fetch(`/api/orders/${receipt.id}/payment`, { cache: "no-store",
        headers: { "X-Order-Token": receipt.accessToken } });
      if (!response.ok) throw new Error("No se pudo consultar el pago.");
      const current = (await response.json()) as { status: string; paymentStatus: string };
      const updated = { ...receipt, status: current.status, paymentStatus: current.paymentStatus };
      setReceipt(updated);
      setSavedOrders(finished(updated) ? rememberQR(null, receipt.id) : rememberQR(updated));
      notify.info(updated.status === "confirmed" ? "Tu pedido está confirmado." : updated.status === "cancelled" ? "El pedido fue cancelado." :
        updated.paymentStatus === "verified" ? "El negocio verificó tu pago." : updated.paymentStatus === "rejected" ? "El comprobante fue rechazado; puedes subir otro." :
        updated.paymentStatus === "submitted" ? "Tu comprobante está en revisión." : "El pedido sigue esperando tu comprobante.");
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "No se pudo consultar el pago.";
      setProofError(message); notify.error(message);
    }
  }

  const drawer = layout === "drawer";
  const heading = drawer ? "xp-display m-0 text-[28px] leading-none" : "xp-display m-0 text-[clamp(36px,5vw,72px)] leading-[0.95]";
  const primary = "xp-btn h-14 w-full bg-ink tracking-[0.08em] text-white hover:bg-[#333] disabled:cursor-not-allowed disabled:opacity-40";
  const choice = (selected: boolean) => `flex w-full items-start gap-3.5 border bg-white p-4 text-left ${selected ? "border-ink" : "border-line hover:border-graphite"}`;
  const dot = (selected: boolean) => `mt-0.5 size-[18px] shrink-0 rounded-full ${selected ? "border-[6px] border-ink" : "border border-[#9a9a9a]"}`;

  const pendingPanel = savedOrders.filter((order) => order.id !== receipt?.id).length > 0 && <div className="border border-line p-4 text-sm">
    <p className="m-0 font-semibold">Pedidos en seguimiento</p>
    <p className="m-0 mt-1 text-xs text-graphite">Retoma el pago o consulta el estado de un pedido anterior.</p>
    <div className="mt-3 flex flex-wrap gap-2">{savedOrders.filter((order) => order.id !== receipt?.id).map((order) =>
      <button className="h-9 border border-line px-3 font-mono text-xs hover:border-ink" key={order.id} onClick={() => openOrder(order)} type="button">{order.number}</button>)}</div>
  </div>;

  const summary = (action: ReactNode) => <div className="flex flex-col gap-4 bg-soft p-5">
    <div className="flex flex-col gap-2.5 text-sm">
      <div className="flex justify-between"><span>Subtotal ({units} {units === 1 ? "unidad" : "unidades"})</span><span className="font-mono">{formatBOB(total)}</span></div>
      <div className="flex justify-between"><span>Entrega</span><span className="text-right text-graphite">{step === "details" && deliveryMethod === "delivery" ? "Envío: se cotiza por WhatsApp" : step === "details" ? "Recojo sin costo" : "Recojo o envío"}</span></div>
    </div>
    <div className="flex items-baseline justify-between border-t border-ink pt-4">
      <span className="text-base font-semibold">{paymentMethod === "qr" ? "Total a pagar" : "Total de productos"}</span><span className="font-mono text-2xl">{formatBOB(total)}</span>
    </div>
    {action}
  </div>;

  let content: ReactNode;
  if (view === "cart") {
    content = <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-4 border-b border-ink pb-4">
        <h2 className={heading}>Tu carrito</h2>
        <span className="font-mono text-xs text-graphite">{units} {units === 1 ? "unidad" : "unidades"}</span>
      </div>
      {!loaded ? <p className="text-sm text-graphite">Cargando carrito…</p> : cartLines.length === 0 ? <div className="flex flex-col items-start gap-4 py-4">
        <p className="m-0 text-graphite">Tu carrito está vacío.</p>
        <Link className="xp-btn border border-ink text-ink hover:bg-ink hover:text-white" href="/catalogo" onClick={onClose}>Ver catálogo</Link>
      </div> : <>
        <ul className="m-0 list-none p-0">
          {cartLines.map((line) => <li className="flex gap-4 border-b border-line py-4" key={line.variantId}>
            <Link className="relative aspect-[3/4] w-20 shrink-0 overflow-hidden bg-mist" href={productHref(line.product)} onClick={onClose}>
              {line.product.media[0] ? <MediaImage alt={line.product.media[0].altText || line.product.name} className="absolute inset-0 h-full w-full object-cover"
                height={107} sizes="80px" src={line.product.media[0].url} width={80} /> : <BrandPlaceholder />}
            </Link>
            <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
              <div className="flex justify-between gap-3">
                <div className="min-w-0">
                  <Link className="text-[15px] font-semibold hover:underline" href={productHref(line.product)} onClick={onClose}>{titleCase(line.product.name)}</Link>
                  <p className="m-0 mt-0.5 text-[13px] text-graphite">{[line.product.color && titleCase(line.product.color), `Talla ${sizeLabel(line.variant)}`].filter(Boolean).join(" · ")}</p>
                  <p className="m-0 mt-0.5 font-mono text-[11px] text-graphite">{formatBOB(line.variant.priceMinor)} c/u</p>
                  {!variantInStock(line.variant) && <p className="m-0 mt-1 text-xs font-semibold text-red-700">Sin existencias · quítalo para continuar</p>}
                </div>
                <span className="shrink-0 font-mono text-sm">{formatBOB(line.variant.priceMinor * line.quantity)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex h-10 items-center border border-line">
                  <button aria-label={`Quitar una unidad de ${line.product.name}`} className="h-full w-10" disabled={busy}
                    onClick={() => updateCart(line.variantId, line.quantity - 1)} type="button">−</button>
                  <span className="w-7 text-center font-mono text-sm">{line.quantity}</span>
                  <button aria-label={`Agregar una unidad de ${line.product.name}`} className="h-full w-10 disabled:text-line" disabled={busy || line.quantity >= maxLineQuantity}
                    onClick={() => updateCart(line.variantId, line.quantity + 1)} type="button">+</button>
                </div>
                <button className="text-[13px] text-graphite underline underline-offset-4 hover:text-ink" disabled={busy}
                  onClick={() => updateCart(line.variantId, 0)} type="button">Eliminar</button>
              </div>
            </div>
          </li>)}
        </ul>
        {summary(<>
          {soldOutLines.length > 0 && <p className="m-0 border-l-2 border-red-700 bg-white p-3 text-sm text-red-800" role="alert">
            {soldOutLines.length === 1 ? "Un producto de tu carrito ya no tiene existencias." : `${soldOutLines.length} productos de tu carrito ya no tienen existencias.`} Quítalos para finalizar la compra.
          </p>}
          <button className={primary} disabled={soldOutLines.length > 0} onClick={() => { setStep("details"); setError(""); scrollTop(); }} type="button">Finalizar pedido</button>
          <p className="m-0 text-xs leading-relaxed text-graphite">Podrás elegir entre coordinar por WhatsApp o pagar con QR. El servidor confirma precios y disponibilidad al registrar el pedido.</p>
        </>)}
      </>}
      {pendingPanel}
    </div>;
  } else if (view === "details") {
    content = <form className="flex flex-col gap-5" onSubmit={(event) => void submit(event)}>
      <button className="self-start text-sm text-graphite hover:text-ink" disabled={busy} onClick={() => setStep("cart")} type="button">← Volver al carrito</button>
      <h2 className={`${heading} border-b border-ink pb-4`}>Datos del pedido</h2>
      <div className={`grid gap-4 ${drawer ? "" : "sm:grid-cols-2"}`}>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">Nombre completo *
          <input autoComplete="name" className={field} disabled={busy} maxLength={120} minLength={2}
            onChange={(event) => setCustomerName(event.target.value)} placeholder="Nombre y apellido" required value={customerName} />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">Celular / WhatsApp *
          <input autoComplete="tel" className={field} disabled={busy} inputMode="tel" maxLength={25}
            onChange={(event) => setCustomerPhone(event.target.value)} placeholder="+591 7xx xxxxx" required type="tel" value={customerPhone} />
        </label>
      </div>
      <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
        <legend className="mb-2.5 p-0 text-[15px] font-semibold">Forma de entrega *</legend>
        {([["pickup", "Recojo en sucursal", "Sin costo. Retira tu pedido cuando el negocio lo confirme."],
          ["delivery", "Envío a domicilio", "La dirección y el costo del envío se coordinan por WhatsApp; se pagan aparte."]] as const).map(([value, name, text]) =>
          <label className={choice(deliveryMethod === value)} key={value}>
            <input checked={deliveryMethod === value} className="sr-only" disabled={busy} name="delivery" onChange={() => setDeliveryMethod(value)} type="radio" />
            <span aria-hidden="true" className={dot(deliveryMethod === value)} />
            <span className="flex flex-col gap-1"><span className="text-[15px] font-semibold">{name}</span><span className="text-[13px] text-graphite">{text}</span></span>
          </label>)}
      </fieldset>
      <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
        <legend className="mb-2.5 p-0 text-[15px] font-semibold">Cómo quieres continuar *</legend>
        {([[
          "whatsapp", "Coordinar por WhatsApp", "Registra el pedido y envía el detalle al negocio. No necesitas subir un comprobante.",
        ], [
          "qr", "Pagar con QR", "Transfiere los productos y sube tu comprobante; el negocio verificará el abono.",
        ]] as const).map(([value, name, text]) =>
          <label className={`${choice(paymentMethod === value)} ${value === "qr" && !qrAvailable ? "opacity-50" : ""}`} key={value}>
            <input checked={paymentMethod === value} className="sr-only" disabled={busy || (value === "qr" && !qrAvailable)}
              name="payment" onChange={() => setPaymentMethod(value)} type="radio" />
            <span aria-hidden="true" className={dot(paymentMethod === value)} />
            <span className="flex flex-col gap-1"><span className="text-[15px] font-semibold">{name}</span><span className="text-[13px] text-graphite">{text}</span></span>
          </label>)}
        {businessChecked && !qrAvailable && <p className="m-0 text-xs text-graphite">El QR no está disponible por ahora. Puedes continuar por WhatsApp.</p>}
      </fieldset>
      <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
        <legend className="mb-2.5 p-0 text-[15px] font-semibold">{deliveryMethod === "delivery" ? "Sucursal que despacha tu pedido *" : "Sucursal de recojo *"}</legend>
        {branchError && <p className="m-0 text-sm text-red-700">{branchError}</p>}
        {branches.map((branch) => { const missing = missingAtBranch(branch.id).length; return <label className={choice(branch.id === pickupBranchId)} key={branch.id}>
          <input checked={branch.id === pickupBranchId} className="sr-only" disabled={busy} name="branch"
            onChange={() => setPickupBranchId(branch.id)} required type="radio" value={branch.id} />
          <span aria-hidden="true" className={dot(branch.id === pickupBranchId)} />
          <span className="flex flex-col gap-1">
            <span className="text-[15px] font-semibold">{branch.name}</span>
            {branch.address && <span className="text-[13px] text-graphite">{branch.address}</span>}
            {deliveryMethod === "pickup" && branch.instructions && <span className="text-[13px] text-graphite">{branch.instructions}</span>}
            <span className={`text-xs font-medium ${missing ? "text-red-700" : "text-graphite"}`}>{missing ? `Sin existencias de ${missing} producto(s) de tu pedido` : "Tiene todos los productos de tu pedido"}</span>
          </span>
        </label>; })}
        {missingHere.length > 0 && <p className="m-0 border-l-2 border-red-700 bg-red-50 p-3 text-sm text-red-800" role="alert">
          Esta sucursal no tiene {missingHere.map((line) => `${titleCase(line.product.name)} (${sizeLabel(line.variant)})`).join(", ")}. Elige otra sucursal o vuelve al carrito para quitarlos.
        </p>}
      </fieldset>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium">Indicaciones adicionales (opcional)
        <textarea className="w-full border border-line p-3.5 text-[15px] outline-none focus:border-ink" disabled={busy} maxLength={500}
          onChange={(event) => setCustomerNote(event.target.value)} placeholder={deliveryMethod === "delivery" ? "Zona o referencia para el envío" : "Horario de recojo u otra indicación"}
          rows={3} value={customerNote} />
      </label>
      {error && <p className="m-0 border-l-2 border-red-700 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
      {summary(<>
        <button className={primary} disabled={busy || !pickupBranchId || (paymentMethod === "qr" && !qrAvailable) || missingHere.length > 0} type="submit">
          {busy ? "Registrando…" : paymentMethod === "qr" ? "Continuar con el pago" : "Registrar pedido"}
        </button>
        <p className="m-0 text-xs leading-relaxed text-graphite">Al continuar se registra tu pedido. Desde ese momento el carrito ya no se puede modificar.</p>
      </>)}
    </form>;
  } else if (view === "payment" && receipt) {
    content = <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5 border-b border-ink pb-4">
        <span className="xp-label text-graphite">Pedido {receipt.number}</span>
        <h2 className={heading}>Pago por QR</h2>
      </div>
      <div className="flex items-baseline justify-between gap-4 bg-soft p-5">
        <span className="text-sm font-semibold">Total a pagar</span>
        <span className="font-mono text-[28px]">{formatBOB(receipt.totalMinor)}</span>
      </div>
      {receipt.deliveryMethod === "delivery" && <p className="m-0 -mt-2 text-[13px] text-graphite">No incluye el envío: su costo se coordina por WhatsApp.</p>}
      {receipt.paymentStatus === "rejected" && <p className="m-0 border-l-2 border-red-700 bg-red-50 p-3 text-sm text-red-800">El comprobante anterior fue rechazado. Consulta con el negocio y sube uno nuevo si corresponde.</p>}
      {qrAvailable ? <div className={`flex flex-col items-center gap-3 ${drawer ? "" : "sm:flex-row sm:items-start sm:gap-8"}`}>
        <Image alt="QR de transferencia vigente" className="size-[220px] border border-ink bg-white object-contain p-2" height={220} src={business!.qrUrl} unoptimized width={220} />
        <div className="flex flex-col items-center gap-2 sm:items-start">
          <a className="xp-btn h-11 border border-ink px-5 text-ink hover:bg-ink hover:text-white" download={`qr-${receipt.number}.png`} href={business!.qrUrl}>Descargar QR</a>
          <span className="font-mono text-[11px] text-graphite">Vigente hasta {business!.qrExpiresOn}</span>
        </div>
      </div> : <p className="m-0 border-l-2 border-amber-600 bg-amber-50 p-3 text-sm text-amber-900">El QR ya no está disponible. Escribe al negocio por WhatsApp antes de transferir.
        <a className="ml-1 font-semibold underline" href={receipt.whatsappUrl} rel="noopener noreferrer" target="_blank">Abrir WhatsApp</a></p>}
      <section className="flex flex-col gap-4">
        <h3 className="m-0 text-base font-semibold">Pasos a seguir para realizar el pago</h3>
        <ol className="m-0 flex list-none flex-col gap-4 p-0">
          {[<>Ingresa a la app de tu banco.</>, <>Escanea o carga la imagen del código <strong>QR</strong>.</>,
            <>Transfiere el total exacto y sigue el proceso hasta finalizar. Si tu banco lo permite, escribe <strong className="font-mono">{receipt.number}</strong> como referencia.</>,
            <>Adjunta aquí abajo la captura o el PDF de tu <strong>comprobante</strong>.</>].map((text, index) =>
            <li className="flex items-center gap-3.5" key={index}>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-[15px] font-medium text-white">{index + 1}</span>
              <StepIcon index={index} />
              <span className="text-sm leading-snug text-body">{text}</span>
            </li>)}
        </ol>
      </section>
      <form className="flex flex-col gap-3 border-t border-line pt-5" onSubmit={(event) => void uploadProof(event)}>
        <label className={`flex cursor-pointer flex-col items-center gap-2 border border-dashed p-6 text-center ${proofFile ? "border-ink bg-soft" : "border-[#bdbdbd] hover:border-ink"}`}>
          <svg aria-hidden="true" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.4" viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>
          <span className="text-sm font-semibold">{proofFile ? proofFile.name : "Adjuntar comprobante"}</span>
          <span className="text-xs text-graphite">{proofFile ? "Toca para cambiar el archivo" : "PNG, JPEG o PDF de hasta 8 MB"}</span>
          <input accept="image/png,image/jpeg,application/pdf" className="sr-only" disabled={proofBusy}
            onChange={(event) => { setProofFile(event.target.files?.[0] || null); setProofError(""); }} required type="file" />
        </label>
        {proofError && <p className="m-0 text-sm text-red-700" role="alert">{proofError}</p>}
        <button className={primary} disabled={!proofFile || proofBusy} type="submit">{proofBusy ? "Enviando comprobante…" : "Enviar comprobante y continuar"}</button>
        <p className="m-0 text-xs leading-relaxed text-graphite">Tu pedido {receipt.number} ya está registrado. Si sales ahora, podrás retomar el pago desde el carrito.</p>
      </form>
    </div>;
  } else if (receipt) {
    const cancelled = receipt.status === "cancelled";
    const title = cancelled ? "Pedido cancelado" : receipt.status === "confirmed" ? "Pedido confirmado" :
      receipt.paymentMethod === "whatsapp" ? "Pedido registrado" :
      receipt.paymentStatus === "verified" ? "Pago verificado" : "Comprobante recibido";
    content = <div className="flex flex-col gap-5">
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
      <img alt="" className="w-12" src="/brand/xpander-x.png" />
      <div className="flex flex-col gap-1.5">
        <span className="xp-label text-graphite">Pedido {receipt.number}</span>
        <h2 className={heading}>{title}</h2>
      </div>
      <p className="m-0 text-[15px] leading-relaxed text-body">
        {cancelled ? receipt.paymentMethod === "qr" ? "El negocio canceló este pedido. Si ya realizaste un pago, escríbele por WhatsApp para resolverlo." :
          "El negocio canceló este pedido. Escríbele por WhatsApp si necesitas más información." :
          receipt.status === "confirmed" ? receipt.paymentMethod === "qr" ? "El negocio verificó tu pago y confirmó el pedido." : "El negocio confirmó tu pedido." :
          receipt.paymentMethod === "whatsapp" ? "Envía el detalle por WhatsApp para que el negocio coordine y confirme tu pedido." :
          receipt.paymentStatus === "verified" ? "El negocio verificó el abono en su banca y confirmará tu pedido." :
          "Último paso: envía el detalle de tu pedido por WhatsApp. El negocio verificará el abono en su banca y confirmará tu pedido."}
        {!cancelled && receipt.deliveryMethod === "delivery" && " Coordina allí la dirección y el costo del envío."}
      </p>
      <div className="flex flex-col gap-2.5 bg-soft p-5">
        <a className={primary} href={receipt.whatsappUrl} rel="noopener noreferrer" target="_blank">Enviar detalle por WhatsApp</a>
        <p className="m-0 text-xs leading-relaxed text-graphite">Se abrirá WhatsApp con el mensaje listo; pulsa «Enviar» para que llegue.
          {receipt.paymentMethod === "qr" && " Tu comprobante ya quedó guardado en el sistema."}</p>
      </div>
      {proofError && <p className="m-0 text-sm text-red-700" role="alert">{proofError}</p>}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <button className="font-medium underline underline-offset-4" onClick={() => void refreshPayment()} type="button">Consultar estado</button>
        <button className="font-medium underline underline-offset-4" onClick={startOver} type="button">{cartLines.length > 0 ? "Volver al carrito" : "Hacer otro pedido"}</button>
        <Link className="font-medium underline underline-offset-4" href="/catalogo" onClick={onClose}>Seguir comprando</Link>
      </div>
      {pendingPanel}
    </div>;
  }

  return <div className="flex flex-col gap-6" ref={top}>
    <ol aria-label="Pasos de la compra" className="m-0 grid list-none grid-cols-4 gap-2 p-0">
      {steps.map((name, index) => <li key={name}>
        <div className={`h-0.5 ${index <= stepIndex ? "bg-ink" : "bg-line"}`} />
        <span aria-current={index === stepIndex ? "step" : undefined} className={`mt-2 block text-[12px] ${index === stepIndex ? "font-semibold" : index < stepIndex ? "" : "text-[#757575]"}`}>
          <span className="font-mono">0{index + 1}</span> {name}
        </span>
      </li>)}
    </ol>
    {content}
  </div>;
}
