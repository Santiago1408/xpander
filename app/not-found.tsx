import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Página no encontrada | XPANDER" };

export default function NotFound() {
  return <main className="flex min-h-screen flex-col bg-white text-ink">
    <div className="xp-container flex flex-1 flex-col justify-center gap-8 py-20">
      <Link aria-label="Inicio de XPANDER" className="self-start" href="/">
        {/* eslint-disable-next-line @next/next/no-img-element -- store logo from /api/brand */}
        <img alt="XPANDER" className="h-6 w-auto" src="/api/brand/logotipo" />
      </Link>
      <div className="flex flex-col gap-4">
        <span className="font-mono text-xs uppercase tracking-[0.12em] text-graphite">Error 404</span>
        <h1 className="xp-display m-0 max-w-4xl text-[clamp(40px,7vw,104px)] leading-[0.92] tracking-[-0.02em]">Esta página no existe</h1>
        <p className="m-0 max-w-md text-lg text-body">Puede que el producto ya no esté disponible o que el enlace tenga un error.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link className="inline-flex h-12 items-center bg-ink px-6 text-sm font-semibold uppercase tracking-[0.04em] text-white hover:bg-[#333]" href="/catalogo">Ver catálogo</Link>
        <Link className="inline-flex h-12 items-center border border-ink px-6 text-sm font-semibold uppercase tracking-[0.04em] hover:bg-ink hover:text-white" href="/">Ir al inicio</Link>
      </div>
    </div>
  </main>;
}
