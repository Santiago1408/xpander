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
  return <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-l-2 p-4 text-sm ${blocking ? "border-red-700 bg-red-50 text-red-900" : "border-amber-600 bg-amber-50 text-amber-950"}`} role="alert">
    <span className="flex-1 font-medium">{text}</span>
    <Link className="font-semibold underline underline-offset-4" href="/admin/negocio">Configurar QR →</Link>
  </div>;
}

export const adminSections = [
  { href: "/admin", label: "Resumen" },
  { href: "/admin/pedidos", label: "Pedidos", badge: true },
  { href: "/admin/catalogo/productos", label: "Productos" },
  { href: "/admin/inventario", label: "Inventario" },
  { href: "/admin/catalogo/valores", label: "Marcas, estilos y público" },
  { href: "/admin/medios", label: "Banco de imágenes" },
  { href: "/admin/contenido", label: "Contenido web" },
  { href: "/admin/negocio", label: "Datos del negocio" },
  { href: "/admin/sucursales", label: "Sucursales" },
  { href: "/admin/papelera", label: "Papelera" },
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
    <img alt="" className="w-7 invert" src="/brand/xpander-x.png" />
    <span className="flex flex-col gap-1">
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
      <img alt="XPANDER" className="h-[13px] w-auto invert" src="/brand/xpander-wordmark.png" />
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#bdbdbd]">Admin</span>
    </span>
  </Link>;
}

export default function AdminShell({ user, children }: { user: AdminUser; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, setPending] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
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

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    const target = /^xp-?\d+$/i.test(value) || /^\+?[\d\s()-]{7,}$/.test(value) ? "/admin/pedidos" : "/admin/catalogo/productos";
    router.push(`${target}?q=${encodeURIComponent(value)}`);
    setQuery("");
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

  const userCard = <div className="flex items-center gap-3 border-t border-[#333] px-3 pt-4">
    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-[13px] font-semibold text-ink">{initials(user.displayName)}</span>
    <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-[13px]">
      <span className="truncate font-semibold">{user.displayName}</span>
      <span className="text-xs text-[#bdbdbd]">{role} · @{user.username}</span>
    </span>
  </div>;

  const tabs = [adminSections[0], adminSections[1], adminSections[2]];

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

    <div className="flex min-w-0 flex-1 flex-col pb-20 lg:pb-0">
      <div className="sticky top-0 z-40 flex items-center gap-3 border-b border-line bg-white px-4 py-3 lg:hidden">
        <Link aria-label="Resumen del panel" className="flex items-center gap-2.5" href="/admin">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
          <img alt="" className="w-6" src="/brand/xpander-x.png" />
          <span className="flex flex-col gap-0.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
            <img alt="XPANDER" className="h-[11px] w-auto" src="/brand/xpander-wordmark.png" />
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-graphite">Admin</span>
          </span>
        </Link>
        <Link className="ml-auto inline-flex h-10 items-center border border-line px-3 text-xs font-medium" href="/" target="_blank">Tienda ↗</Link>
        <span className="inline-flex size-10 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">{initials(user.displayName)}</span>
      </div>

      <div className="hidden flex-wrap items-center justify-between gap-4 border-b border-line bg-white px-[clamp(16px,3vw,40px)] py-4 lg:flex">
        <form className="flex h-11 max-w-[420px] flex-1 items-center gap-2.5 border border-line px-3.5 focus-within:border-ink" onSubmit={search} role="search">
          <svg aria-hidden="true" className="size-[18px] shrink-0 text-graphite" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
          <label className="sr-only" htmlFor="admin-search">Buscar pedidos o productos</label>
          <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" id="admin-search" onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar pedidos (XP-000012, teléfono) o productos…" type="search" value={query} />
        </form>
        <div className="flex items-center gap-2">
          <Link aria-label={`${pending} pedidos pendientes`} className="relative inline-flex size-11 items-center justify-center border border-line hover:border-ink" href="/admin/pedidos" title="Pedidos pendientes">
            <svg aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
            {(pending > 0 || qrProblem) && <span className={`absolute right-2 top-2 size-2 rounded-full ${qrProblem ? "bg-red-700" : "bg-ink"}`} />}
          </Link>
          <button className="inline-flex h-11 items-center gap-2 bg-ink px-[18px] text-[13px] font-semibold tracking-[0.04em] text-white hover:bg-[#333]"
            onClick={() => router.push(`/admin/catalogo/productos?nuevo=${Date.now()}`)} type="button">+ Nuevo producto</button>
        </div>
      </div>

      <main className="flex flex-col gap-6 px-[clamp(16px,3vw,40px)] pb-12 pt-8">
        <QRAlert qr={qr} />
        {children}
      </main>
    </div>

    <nav aria-label="Navegación rápida" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-white lg:hidden">
      {tabs.map((section) => {
        const active = isActive(pathname, section.href);
        return <Link aria-current={active ? "page" : undefined} className="relative flex h-16 flex-col items-center justify-center gap-1 text-xs" href={section.href} key={section.href}>
          <span className={`h-0.5 w-6 ${active ? "bg-ink" : "bg-transparent"}`} />
          <span className={active ? "font-semibold" : "text-graphite"}>{section.label}</span>
          {section.badge && pending > 0 && <span className="absolute right-[calc(50%-30px)] top-2 rounded-full bg-ink px-1.5 font-mono text-[10px] text-white">{pending}</span>}
        </Link>;
      })}
      <button aria-expanded={menuOpen} className="flex h-16 flex-col items-center justify-center gap-1 text-xs text-graphite" onClick={() => setMenuOpen(true)} type="button">
        <span className="h-0.5 w-6" />Más
      </button>
    </nav>

    {menuOpen && <div className="fixed inset-0 z-50 flex flex-col bg-ink p-5 text-white lg:hidden" role="dialog" aria-modal="true" aria-label="Menú de administración">
      <div className="mb-6 flex items-center justify-between">
        <Brand />
        <button className="inline-flex h-10 items-center border border-[#333] px-4 text-sm" onClick={() => setMenuOpen(false)} type="button">Cerrar</button>
      </div>
      <div className="flex-1 overflow-y-auto">{nav(() => setMenuOpen(false))}</div>
      <div className="mt-4 flex flex-col gap-3">
        {userCard}
        <LogoutButton className="inline-flex h-11 items-center justify-center border border-[#333] text-sm font-medium disabled:opacity-50" />
      </div>
    </div>}
  </div></AdminUserContext>;
}
