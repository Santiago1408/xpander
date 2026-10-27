"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

export type CatalogProduct = {
  id: number; code: string; name: string; description: string; style: string;
  audience: string; color: string; brandName: string; isFeatured: boolean;
  variants: { id: number; code: string; sizeAlpha: string; sizeNumeric: string;
    priceMinor: number; compareAtPriceMinor: number | null }[];
  media: { id: number; url: string; altText: string }[];
};

type CartItem = { variantId: number; quantity: number };
type Branch = { id: number; name: string; address: string; instructions: string };
type Receipt = { id: number; number: string; status: string; totalMinor: number; whatsappUrl: string;
  paymentMethod: "whatsapp" | "qr"; paymentStatus: string; accessToken: string };
type QRProfile = { qrUrl: string; qrExpiresOn: string };

const cartStorageKey = "xpander_cart_v1";
const pendingQRKey = "xpander_pending_qr_order_v1";

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

function money(minor: number): string {
  const whole = Math.floor(minor / 100).toLocaleString("es-BO");
  return `Bs ${whole},${String(minor % 100).padStart(2, "0")}`;
}

function sizeLabel(variant: CatalogProduct["variants"][number]) {
  return [variant.sizeAlpha, variant.sizeNumeric].filter(Boolean).join(" / ");
}

export default function CatalogShop({ products }: { products: CatalogProduct[] }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [pickupBranchId, setPickupBranchId] = useState(0);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [savedOrders, setSavedOrders] = useState<Receipt[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"whatsapp" | "qr">("whatsapp");
  const [qrProfile, setQRProfile] = useState<QRProfile | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofBusy, setProofBusy] = useState(false);
  const [proofError, setProofError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [branchError, setBranchError] = useState("");
  const [search, setSearch] = useState("");
  const [styleFilter, setStyleFilter] = useState("");
  const [audienceFilter, setAudienceFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [colorFilter, setColorFilter] = useState("");
  const pendingRequest = useRef<{ key: string; payload: string } | null>(null);

  const variantMap = useMemo(() => {
    const map = new Map<number, { product: CatalogProduct; variant: CatalogProduct["variants"][number] }>();
    for (const product of products) for (const variant of product.variants) {
      map.set(variant.id, { product, variant });
    }
    return map;
  }, [products]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = JSON.parse(window.localStorage.getItem(cartStorageKey) || "[]") as unknown;
        if (Array.isArray(raw)) {
          const next: CartItem[] = [];
          for (const entry of raw) {
            if (typeof entry === "object" && entry !== null &&
              Number.isSafeInteger(entry.variantId) && Number.isSafeInteger(entry.quantity) &&
              entry.quantity > 0 && entry.quantity <= 20 && variantMap.has(entry.variantId) &&
              !next.some((item) => item.variantId === entry.variantId)) {
              next.push({ variantId: entry.variantId, quantity: entry.quantity });
            }
            if (next.length >= 20) break;
          }
          setCart(next);
        }
      } catch { /* A malformed local cart starts empty. */ }
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [variantMap]);

  useEffect(() => {
    if (loaded) window.localStorage.setItem(cartStorageKey, JSON.stringify(cart));
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
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/business", { cache: "no-store" });
        if (!response.ok) return;
        const profile = (await response.json()) as QRProfile;
        if (profile.qrUrl) setQRProfile(profile);
      } catch { /* Ordering by WhatsApp remains available. */ }
    })();
    const timer = window.setTimeout(() => {
      try {
        const saved = savedQRReceipts();
        setSavedOrders(saved);
        const previous = saved.at(-1);
        if (previous) {
            setReceipt(previous); setCartOpen(true);
            void fetch(`/api/orders/${previous.id}/payment`, { cache: "no-store",
              headers: { "X-Order-Token": previous.accessToken } }).then(async (response) => {
                if (!response.ok) return;
                const current = (await response.json()) as { status: string; paymentStatus: string };
                setReceipt({ ...previous, status: current.status, paymentStatus: current.paymentStatus });
                if (current.paymentStatus === "verified" || current.status === "confirmed")
                  setSavedOrders(rememberQR(null, previous.id));
              }).catch(() => undefined);
        }
      } catch { setSavedOrders([]); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const cartLines = cart.flatMap((item) => {
    const found = variantMap.get(item.variantId);
    return found ? [{ ...item, ...found }] : [];
  });
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = cartLines.reduce((sum, line) => sum + line.quantity * line.variant.priceMinor, 0);
  const selectedBranch = branches.find((branch) => branch.id === pickupBranchId);
  const filterOptions = useMemo(() => {
    const values = (field: "style" | "audience" | "brandName" | "color") =>
      [...new Set(products.map((product) => product[field]).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "es-BO"));
    return { styles: values("style"), audiences: values("audience"),
      brands: values("brandName"), colors: values("color") };
  }, [products]);
  const filteredProducts = useMemo(() => {
    const query = search.trim().toLocaleUpperCase("es-BO");
    return products.filter((product) =>
      (!styleFilter || product.style === styleFilter) &&
      (!audienceFilter || product.audience === audienceFilter) &&
      (!brandFilter || product.brandName === brandFilter) &&
      (!colorFilter || product.color === colorFilter) &&
      (!query || `${product.name} ${product.code} ${product.description}`.toLocaleUpperCase("es-BO").includes(query)));
  }, [products, search, styleFilter, audienceFilter, brandFilter, colorFilter]);

  function updateCart(variantId: number, quantity: number) {
    if (receipt?.paymentMethod === "qr" && receipt.paymentStatus !== "submitted") return;
    setReceipt(null); setError("");
    pendingRequest.current = null;
    setCart((current) => {
      const others = current.filter((item) => item.variantId !== variantId);
      if (quantity <= 0) return others;
      if (others.length >= 20 || quantity > 20) return current;
      return [...others, { variantId, quantity }];
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || cartLines.length === 0 || !pickupBranchId) return;
    setBusy(true); setError(""); setReceipt(null);
    try {
      const data = {
        pickupBranchId, paymentMethod, customerName: customerName.trim(), customerPhone: customerPhone.trim(),
        customerNote: customerNote.trim(), items: cartLines.map((line) => ({
          variantId: line.variantId, quantity: line.quantity,
          expectedUnitPriceMinor: line.variant.priceMinor,
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
      window.localStorage.removeItem(cartStorageKey);
      setCart([]);
      pendingRequest.current = null;
      setReceipt(saved);
      if (saved.paymentMethod === "qr") {
        setSavedOrders(rememberQR(saved));
        try {
          const currentQR = await fetch("/api/business", { cache: "no-store" });
          if (currentQR.ok) {
            const profile = (await currentQR.json()) as QRProfile;
            setQRProfile(profile.qrUrl ? profile : null);
          }
        } catch { setQRProfile(null); }
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo registrar el pedido.");
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
    } catch (failure) { setProofError(failure instanceof Error ? failure.message : "No se pudo subir el comprobante."); }
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
      if (current.paymentStatus === "verified" || current.status === "confirmed")
        setSavedOrders(rememberQR(null, receipt.id));
      else setSavedOrders(rememberQR(updated));
    } catch (failure) { setProofError(failure instanceof Error ? failure.message : "No se pudo consultar el pago."); }
  }

  return <>
    <section aria-label="Filtros del catálogo" className="mb-7 rounded-xl border border-zinc-200 bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-sm">Buscar
          <input className="mt-1 block w-full rounded-lg border border-zinc-300 p-2" onChange={(event) => setSearch(event.target.value)}
            placeholder="Nombre o código" type="search" value={search} />
        </label>
        <label className="text-sm">Estilo
          <select className="mt-1 block w-full rounded-lg border border-zinc-300 p-2" onChange={(event) => setStyleFilter(event.target.value)} value={styleFilter}>
            <option value="">Todos</option>{filterOptions.styles.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="text-sm">Público
          <select className="mt-1 block w-full rounded-lg border border-zinc-300 p-2" onChange={(event) => setAudienceFilter(event.target.value)} value={audienceFilter}>
            <option value="">Todos</option>{filterOptions.audiences.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="text-sm">Marca
          <select className="mt-1 block w-full rounded-lg border border-zinc-300 p-2" onChange={(event) => setBrandFilter(event.target.value)} value={brandFilter}>
            <option value="">Todas</option>{filterOptions.brands.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="text-sm">Color
          <select className="mt-1 block w-full rounded-lg border border-zinc-300 p-2" onChange={(event) => setColorFilter(event.target.value)} value={colorFilter}>
            <option value="">Todos</option>{filterOptions.colors.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-600">
        <p>{filteredProducts.length} producto(s)</p>
        {(search || styleFilter || audienceFilter || brandFilter || colorFilter) &&
          <button className="underline" onClick={() => {
            setSearch(""); setStyleFilter(""); setAudienceFilter(""); setBrandFilter(""); setColorFilter("");
          }} type="button">Limpiar filtros</button>}
      </div>
    </section>
    {filteredProducts.length === 0 && <p className="mb-7 rounded-xl border border-dashed border-zinc-300 p-8 text-zinc-600">
      No hay productos con esos filtros.
    </p>}
    <div className="grid gap-7 md:grid-cols-2 xl:grid-cols-3">
      {filteredProducts.map((product) => {
        const prices = product.variants.map((variant) => variant.priceMinor);
        const lowest = Math.min(...prices);
        return <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white" id={`producto-${product.id}`} key={product.id}>
          {product.media[0] ? <Image alt={product.media[0].altText} className="aspect-[4/3] w-full object-cover"
            height={600} src={product.media[0].url} unoptimized width={800} /> :
            <div className="flex aspect-[4/3] items-center justify-center bg-zinc-100 text-sm tracking-[0.25em] text-zinc-400">XPANDER</div>}
          <div className="p-5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
              {product.style && <span>{product.style}</span>}
              {product.audience && <span>· {product.audience}</span>}
              {product.color && <span>· {product.color}</span>}
              {product.brandName && <span>· {product.brandName}</span>}
              {product.isFeatured && <span className="rounded-full bg-zinc-950 px-2 py-1 text-white">Destacado</span>}
            </div>
            <h2 className="mt-3 text-xl font-semibold">{product.name}</h2>
            <p className="mt-1 text-xs text-zinc-500">Código {product.code}</p>
            {product.description && <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-zinc-600">{product.description}</p>}
            <p className="mt-5 text-lg font-semibold">{prices.length > 1 ? "Desde " : ""}{money(lowest)}</p>
            <ul className="mt-4 space-y-3 text-sm text-zinc-700">
              {product.variants.map((variant) => <li className="flex flex-wrap items-center justify-between gap-3" key={variant.id}>
                <span>{sizeLabel(variant)} · {variant.code}</span>
                <span className="flex items-center gap-2">
                  {variant.compareAtPriceMinor !== null && <span className="text-zinc-400 line-through">{money(variant.compareAtPriceMinor)}</span>}
                  <span>{money(variant.priceMinor)}</span>
                  <button className="rounded-lg border border-zinc-950 px-3 py-1 font-medium text-zinc-950 hover:bg-zinc-950 hover:text-white"
                    onClick={() => { updateCart(variant.id, (cart.find((item) => item.variantId === variant.id)?.quantity || 0) + 1); setCartOpen(true); }}
                    type="button">Agregar</button>
                </span>
              </li>)}
            </ul>
            <p className="mt-4 text-xs text-zinc-500">Disponibilidad sujeta a confirmación en tienda.</p>
          </div>
        </article>;
      })}
    </div>
    <button className="fixed bottom-5 right-5 z-30 rounded-full bg-zinc-950 px-5 py-3 font-medium text-white shadow-xl"
      onClick={() => setCartOpen(true)} type="button">Carrito · {cartCount}</button>
    {cartOpen && <div className="fixed inset-0 z-40 bg-black/50" role="presentation">
      <div aria-label="Carrito de compras" aria-modal="true" className="ml-auto h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-xl sm:p-7" role="dialog">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold">Carrito</h2>
          <button className="rounded-lg border border-zinc-300 px-3 py-2 text-sm" onClick={() => setCartOpen(false)} type="button">Cerrar</button>
        </div>
        {savedOrders.length > 0 && <div className="mt-5 rounded-lg border border-zinc-200 p-3 text-sm">
          <p className="font-medium">Pedidos QR pendientes de seguimiento</p>
          <div className="mt-2 flex flex-wrap gap-2">{savedOrders.map((order) => <button
            className="rounded border border-zinc-300 px-2 py-1 disabled:bg-zinc-100" disabled={receipt?.id === order.id}
            key={order.id} onClick={() => { setReceipt(order); setProofError(""); }} type="button">{order.number}</button>)}</div>
        </div>}
        {receipt ? <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-5">
          <p className="font-semibold">Pedido {receipt.number} {receipt.status === "confirmed" ? "confirmado" : "registrado como pendiente"}</p>
          <p className="mt-2 text-sm">Total: {money(receipt.totalMinor)}.</p>
          {receipt.paymentMethod === "qr" && <div className="mt-5 rounded-lg border border-green-200 bg-white p-4">
            <h3 className="font-semibold">Transferencia por QR</h3>
            {receipt.paymentStatus === "verified" ?
              <p className="mt-2 text-sm">El administrador verificó el abono. El pedido seguirá su proceso de confirmación y recojo.</p> :
              receipt.paymentStatus === "submitted" ?
              <p className="mt-2 text-sm">Comprobante recibido. El administrador verificará el abono en su banca antes de confirmar el pedido.</p> : <>
                {receipt.paymentStatus === "rejected" && <p className="mt-2 text-sm text-red-700">El comprobante anterior fue rechazado. Consulta con el negocio y sube uno nuevo si corresponde.</p>}
                {qrProfile?.qrUrl ? <>
                  <p className="mt-2 text-sm">Escanea o descarga el QR vigente. Transfiere el total exacto y comprueba el beneficiario en tu aplicación bancaria.</p>
                  <Image alt="QR de transferencia vigente" className="mx-auto mt-4 max-h-72 w-auto rounded-lg border object-contain"
                    height={288} src={qrProfile.qrUrl} unoptimized width={288} />
                  <a className="mt-3 inline-block text-sm text-blue-800 underline" download="xpander-qr.png" href={qrProfile.qrUrl}>Descargar QR</a>
                  <p className="mt-1 text-xs text-zinc-600">Vigente hasta {qrProfile.qrExpiresOn}. Incluye {receipt.number} como referencia si tu banco lo permite.</p>
                </> : <p className="mt-2 text-sm text-amber-800">El QR ya no está disponible. Escribe al negocio antes de realizar una transferencia.</p>}
                <form className="mt-5 space-y-3 border-t pt-4" onSubmit={(event) => void uploadProof(event)}>
                  <label className="block text-sm">Subir comprobante PNG, JPEG o PDF *
                    <input accept="image/png,image/jpeg,application/pdf" className="mt-2 block w-full" required type="file"
                      onChange={(event) => setProofFile(event.target.files?.[0] || null)} />
                  </label>
                  <button className="rounded-lg bg-zinc-950 px-4 py-2 text-sm text-white disabled:opacity-50"
                    disabled={!proofFile || proofBusy} type="submit">{proofBusy ? "Subiendo…" : "Enviar comprobante"}</button>
                </form>
              </>}
            {proofError && <p className="mt-3 text-sm text-red-700" role="alert">{proofError}</p>}
            <button className="mt-4 text-sm text-blue-800 underline" onClick={() => void refreshPayment()}
              type="button">Consultar estado del pago</button>
          </div>}
          <p className="mt-4 text-sm">Abre WhatsApp y envía el detalle del pedido al negocio.</p>
          <a className="mt-4 inline-block rounded-lg bg-green-700 px-4 py-3 font-medium text-white"
            href={receipt.whatsappUrl} rel="noopener noreferrer" target="_blank">Abrir WhatsApp para enviar</a>
          <p className="mt-3 text-xs text-green-900">El pedido quedó guardado aunque cierres WhatsApp. Abrir el enlace no confirma que se haya enviado el mensaje.</p>
          {receipt.paymentMethod === "qr" && <button className="mt-4 block text-sm underline" type="button"
            onClick={() => setReceipt(null)}>Hacer otro pedido</button>}
        </div> : cartLines.length === 0 ? <p className="mt-8 text-zinc-600">Tu carrito está vacío.</p> : <>
          <ul className="mt-6 divide-y divide-zinc-200">{cartLines.map((line) => <li className="flex items-start gap-3 py-4" key={line.variantId}>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{line.product.name}</p>
              <p className="text-sm text-zinc-600">{sizeLabel(line.variant)} · código {line.variant.code}</p>
              <p className="text-sm">{money(line.variant.priceMinor)} por unidad</p>
            </div>
            <div className="flex items-center gap-2">
              <button aria-label={`Quitar una unidad de ${line.product.name}`} className="rounded border px-2" disabled={busy}
                onClick={() => updateCart(line.variantId, line.quantity - 1)} type="button">−</button>
              <span>{line.quantity}</span>
              <button aria-label={`Agregar una unidad de ${line.product.name}`} className="rounded border px-2" disabled={busy || line.quantity >= 20}
                onClick={() => updateCart(line.variantId, line.quantity + 1)} type="button">+</button>
            </div>
          </li>)}</ul>
          <p className="mt-3 text-right text-lg font-semibold">Total estimado: {money(total)}</p>
          <p className="mt-2 text-sm text-zinc-600">El servidor confirmará precios y disponibilidad antes de registrar el pedido. El recojo será en la sucursal elegida.</p>
          {error && <p className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
          <form className="mt-6 space-y-4 border-t border-zinc-200 pt-6" onSubmit={(event) => void submit(event)}>
            <h3 className="text-lg font-semibold">Datos para el recojo</h3>
            <label className="block text-sm">Sucursal *
              <select className="mt-1 w-full rounded-lg border border-zinc-300 p-2" disabled={busy} onChange={(event) => setPickupBranchId(Number(event.target.value))} required value={pickupBranchId}>
                <option value={0}>Selecciona una sucursal</option>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.address ? ` · ${branch.address}` : ""}</option>)}
              </select>
            </label>
            {selectedBranch?.instructions && <p className="text-sm text-zinc-600">{selectedBranch.instructions}</p>}
            {branchError && <p className="text-sm text-red-700">{branchError}</p>}
            <label className="block text-sm">Nombre *
              <input className="mt-1 w-full rounded-lg border border-zinc-300 p-2" disabled={busy} maxLength={120}
                onChange={(event) => setCustomerName(event.target.value)} required value={customerName} />
            </label>
            <label className="block text-sm">Teléfono *
              <input className="mt-1 w-full rounded-lg border border-zinc-300 p-2" disabled={busy} inputMode="tel" maxLength={25}
                onChange={(event) => setCustomerPhone(event.target.value)} required type="tel" value={customerPhone} />
            </label>
            <label className="block text-sm">Nota (opcional)
              <textarea className="mt-1 w-full rounded-lg border border-zinc-300 p-2" disabled={busy} maxLength={500}
                onChange={(event) => setCustomerNote(event.target.value)} rows={3} value={customerNote} />
            </label>
            <fieldset className="space-y-2 rounded-lg border border-zinc-200 p-4 text-sm">
              <legend className="px-1 font-medium">Forma de pago</legend>
              <label className="flex items-center gap-2"><input checked={paymentMethod === "whatsapp"} disabled={busy}
                onChange={() => setPaymentMethod("whatsapp")} type="radio" />Coordinar por WhatsApp</label>
              {qrProfile?.qrUrl && <label className="flex items-center gap-2"><input checked={paymentMethod === "qr"} disabled={busy}
                onChange={() => setPaymentMethod("qr")} type="radio" />Transferir por QR y subir comprobante</label>}
            </fieldset>
            <button className="w-full rounded-lg bg-zinc-950 px-4 py-3 font-medium text-white disabled:opacity-50"
              disabled={busy || !pickupBranchId} type="submit">{busy ? "Registrando…" : "Registrar pedido"}</button>
          </form>
        </>}
      </div>
    </div>}
  </>;
}
