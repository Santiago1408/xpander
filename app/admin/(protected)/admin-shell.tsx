"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";
import LogoutButton from "./logout-button";

type AdminUser = { username: string; displayName: string; role: string };

type QRState = { state: "ok" | "missing" | "expired" | "expiring"; expiresOn: string; daysLeft: number };

const AdminUserContext = createContext<AdminUser | null>(null);

export function useAdminUser() {
  return useContext(AdminUserContext);
}

function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Without a valid QR the store cannot take orders, so the owner sees it on every screen.
async function readQRState(): Promise<QRState | null> {
  const response = await fetch("/api/admin/business", { cache: "no-store" });
  if (!response.ok) return null;
  const profile = (await response.json()) as { qrMediaId: number | null; qrExpiresOn: string };
  if (!profile.qrMediaId) return { state: "missing", expiresOn: "", daysLeft: 0 };
  const media = await fetch("/api/admin/media", { cache: "no-store" });
  if (media.ok) {
    const items = (await media.json()) as { id: number; isDeleted: boolean }[];
    if (items.find((item) => item.id === profile.qrMediaId)?.isDeleted) return { state: "missing", expiresOn: "", daysLeft: 0 };
  }
  const today = localDate(new Date());
  const daysLeft = Math.round((Date.parse(profile.qrExpiresOn) - Date.parse(today)) / 86_400_000);
  return { state: profile.qrExpiresOn < today ? "expired" : daysLeft <= 7 ? "expiring" : "ok", expiresOn: profile.qrExpiresOn, daysLeft };
}

function QRAlert({ qr }: { qr: QRState | null }) {
  if (!qr || qr.state === "ok") return null;
  const blocking = qr.state !== "expiring";
  const text = qr.state === "missing" ? "No hay un QR de pago activo. La tienda no puede recibir pedidos hasta que cargues uno." :
    qr.state === "expired" ? `El QR de pago venció el ${qr.expiresOn}. La tienda no puede recibir pedidos hasta que lo renueves.` :
    `El QR de pago vence ${qr.daysLeft === 0 ? "hoy" : `en ${qr.daysLeft} día(s)`} (${qr.expiresOn}). Renuévalo para no interrumpir los pedidos.`;
  return <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 border-l-2 px-3.5 py-3 text-[13px] sm:p-4 sm:text-sm ${blocking ? "border-red-700 bg-red-50 text-red-900" : "border-amber-600 bg-amber-50 text-amber-950"}`} role="alert">
    <span className="min-w-[200px] flex-1 font-medium">{text}</span>
    <Link className="shrink-0 font-semibold underline underline-offset-4" href="/admin/negocio">Configurar QR →</Link>
  </div>;
}

export const adminSections = [
  { href: "/admin", label: "Resumen" },
  { href: "/admin/pedidos", label: "Pedidos", badge: true },
  { href: "/admin/vender", label: "Vender en tienda" },
  { href: "/admin/catalogo/productos", label: "Productos" },
  { href: "/admin/inventario", label: "Inventario" },
  { href: "/admin/catalogo/valores", label: "Marcas, estilos y público" },
  { href: "/admin/medios", label: "Banco de imágenes" },
  { href: "/admin/contenido", label: "Contenido web" },
  { href: "/admin/generador", label: "Generador" },
  { href: "/admin/negocio", label: "Datos del negocio" },
  { href: "/admin/sucursales", label: "Sucursales" },
  { href: "/admin/papelera", label: "Papelera" },
  { href: "/admin/cuenta", label: "Mi cuenta" },
];

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("es-BO") || "AD";
}

function Brand() {
  return <Link aria-label="Resumen del panel" className="flex items-center gap-3 px-3 text-white" href="/admin">
    {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
    <img alt="" className="w-7 invert" src="/api/brand/isotipo" />
    <span className="flex flex-col gap-1">
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
      <img alt="XPANDER" className="h-[13px] w-auto invert" src="/api/brand/logotipo" />
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#bdbdbd]">Admin</span>
    </span>
  </Link>;
}

export default function AdminShell({ user, children }: { user: AdminUser; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, setPending] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [qr, setQR] = useState<QRState | null>(null);
  const role = user.role === "owner" ? "Propietario" : "Personal";

  // Pending orders badge; it refreshes whenever the owner changes section.
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/admin/orders", { cache: "no-store" }).then(async (response) => {
      if (!response.ok || cancelled) return;
      const orders = (await response.json()) as { status: string }[];
      if (!cancelled) setPending(orders.filter((order) => order.status === "pending").length);
    }).catch(() => undefined);
    void readQRState().then((state) => { if (!cancelled) setQR(state); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [pathname]);
  const qrProblem = Boolean(qr && qr.state !== "ok");

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function close(event: KeyboardEvent) { if (event.key === "Escape") setMenuOpen(false); }
    window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", close); };
  }, [menuOpen]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    const target = /^xp-?\d+$/i.test(value) || /^\+?[\d\s()-]{7,}$/.test(value) ? "/admin/pedidos" : "/admin/catalogo/productos";
    router.push(`${target}?q=${encodeURIComponent(value)}`);
    setQuery(""); setSearchOpen(false);
  }

  const nav = (onNavigate?: () => void) => <nav aria-label="Administración" className="flex flex-col gap-0.5">
    {adminSections.map((section, index) => {
      const active = isActive(pathname, section.href);
      return <Link aria-current={active ? "page" : undefined} href={section.href} key={section.href} onClick={onNavigate}
        className={`flex min-h-11 items-center gap-3 px-3 text-sm text-white transition-colors ${active ? "bg-[#333] font-semibold" : "hover:bg-white/5"}`}>
        <span className="inline-flex w-5 justify-center font-mono text-[11px] opacity-60">{String(index + 1).padStart(2, "0")}</span>
        <span className="flex-1">{section.label}</span>
        {section.badge && pending > 0 && <span className="rounded-full bg-white px-2 py-0.5 font-mono text-[11px] text-ink">{pending}</span>}
      </Link>;
    })}
  </nav>;

  const userCard = <Link className="flex items-center gap-3 border-t border-[#333] px-3 pt-4 hover:opacity-80" href="/admin/cuenta" onClick={() => setMenuOpen(false)} title="Mi cuenta">
    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-[13px] font-semibold text-ink">{initials(user.displayName)}</span>
    <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-[13px]">
      <span className="truncate font-semibold">{user.displayName}</span>
      <span className="text-xs text-[#bdbdbd]">{role} · @{user.username}</span>
    </span>
  </Link>;

  const current = adminSections.find((section) => isActive(pathname, section.href)) ?? adminSections[0];
  const searchForm = (id: string) => <form className="flex h-11 flex-1 items-center gap-2.5 border border-line bg-white px-3.5 focus-within:border-ink lg:max-w-[420px]" onSubmit={search} role="search">
    <svg aria-hidden="true" className="size-[18px] shrink-0 text-graphite" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
    <label className="sr-only" htmlFor={id}>Buscar pedidos o productos</label>
    <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" id={id} onChange={(event) => setQuery(event.target.value)}
      placeholder="Pedido (XP-000012), teléfono o producto" type="search" value={query} />
  </form>;

  return <AdminUserContext value={user}><div className="flex min-h-screen bg-soft text-ink">
    <aside className="sticky top-0 hidden h-screen w-[260px] shrink-0 flex-col gap-8 overflow-y-auto bg-ink px-4 py-7 text-white lg:flex">
      <Brand />
      {nav()}
      <div className="mt-auto flex flex-col gap-3">
        {userCard}
        <div className="flex gap-2 px-3">
          <Link className="inline-flex h-9 flex-1 items-center justify-center border border-[#333] text-xs font-medium hover:bg-white/5" href="/" target="_blank">Ver tienda ↗</Link>
          <LogoutButton className="inline-flex h-9 flex-1 items-center justify-center border border-[#333] text-xs font-medium hover:bg-white/5 disabled:opacity-50" />
        </div>
      </div>
    </aside>

    <div className="flex min-w-0 flex-1 flex-col">
      <div className="sticky top-0 z-40 border-b border-line bg-white lg:hidden">
        <div className="flex items-center gap-2 px-4 py-2.5">
          <button aria-controls="admin-mobile-menu" aria-expanded={menuOpen} aria-label="Abrir menú" className="relative inline-flex size-10 shrink-0 items-center justify-center border border-line hover:border-ink"
            onClick={() => setMenuOpen(true)} type="button">
            <svg aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            {(pending > 0 || qrProblem) && <span className={`absolute -right-1 -top-1 size-3 rounded-full border-2 border-white ${qrProblem ? "bg-red-700" : "bg-ink"}`} />}
          </button>
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-graphite">XPANDER · Admin</span>
            <span className="truncate text-[15px] font-semibold">{current.label}</span>
          </span>
          <button aria-expanded={searchOpen} aria-label="Buscar" className={`relative inline-flex size-10 items-center justify-center border ${searchOpen ? "border-ink" : "border-line"}`}
            onClick={() => setSearchOpen(!searchOpen)} type="button">
            <svg aria-hidden="true" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
          </button>
          <Link aria-label="Mi cuenta" className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white" href="/admin/cuenta">
            {initials(user.displayName)}
          </Link>
        </div>
        {searchOpen && <div className="flex gap-2 border-t border-line px-4 py-2.5">{searchForm("admin-search-mobile")}</div>}
      </div>

      <div className="hidden flex-wrap items-center justify-between gap-4 border-b border-line bg-white px-[clamp(16px,3vw,40px)] py-4 lg:flex">
        {searchForm("admin-search")}
        <div className="flex items-center gap-2">
          <Link aria-label={`${pending} pedidos pendientes`} className="relative inline-flex size-11 items-center justify-center border border-line hover:border-ink" href="/admin/pedidos" title="Pedidos pendientes">
            <svg aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
            {(pending > 0 || qrProblem) && <span className={`absolute right-2 top-2 size-2 rounded-full ${qrProblem ? "bg-red-700" : "bg-ink"}`} />}
          </Link>
          <button className="inline-flex h-11 items-center gap-2 bg-ink px-[18px] text-[13px] font-semibold tracking-[0.04em] text-white hover:bg-[#333]"
            onClick={() => router.push(`/admin/catalogo/productos?nuevo=${Date.now()}`)} type="button">+ Nuevo producto</button>
        </div>
      </div>

      <main className="flex flex-col gap-5 px-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-5 sm:gap-6 sm:px-[clamp(16px,3vw,40px)] sm:pt-8 lg:pb-12">
        <QRAlert qr={qr} />
        {children}
      </main>
    </div>

    {/* Phones: the same side menu slides in from the left. */}
    {menuOpen && <div className="fixed inset-0 z-50 flex bg-ink/60 lg:hidden" onClick={(event) => { if (event.target === event.currentTarget) setMenuOpen(false); }} role="presentation">
      <div aria-label="Menú de administración" aria-modal="true" className="flex h-full w-[min(86vw,320px)] flex-col gap-6 overflow-y-auto bg-ink px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-5 text-white shadow-2xl"
        id="admin-mobile-menu" role="dialog">
        <div className="flex items-center justify-between">
          <Brand />
          <button aria-label="Cerrar menú" className="inline-flex size-10 items-center justify-center border border-[#333]" onClick={() => setMenuOpen(false)} type="button">
            <svg aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <button className="inline-flex h-11 items-center justify-center gap-2 bg-white text-[13px] font-semibold text-ink"
          onClick={() => { setMenuOpen(false); router.push(`/admin/catalogo/productos?nuevo=${Date.now()}`); }} type="button">+ Nuevo producto</button>
        {nav(() => setMenuOpen(false))}
        <div className="mt-auto flex flex-col gap-3">
          {userCard}
          <div className="flex gap-2 px-3">
            <Link className="inline-flex h-10 flex-1 items-center justify-center border border-[#333] text-xs font-medium" href="/" target="_blank">Ver tienda ↗</Link>
            <LogoutButton className="inline-flex h-10 flex-1 items-center justify-center border border-[#333] text-xs font-medium disabled:opacity-50" />
          </div>
        </div>
      </div>
    </div>}
  </div></AdminUserContext>;
}
