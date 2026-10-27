"use client";

import Link from "next/link";
import { useEffect } from "react";

// Shown when a page fails to render, for example while the API is restarting.
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <main className="flex min-h-screen flex-col bg-white text-ink">
    <div className="xp-container flex flex-1 flex-col justify-center gap-8 py-20">
      <Link aria-label="Inicio de XPANDER" className="self-start" href="/">
        {/* eslint-disable-next-line @next/next/no-img-element -- store logo from /api/brand */}
        <img alt="XPANDER" className="h-6 w-auto" src="/api/brand/logotipo" />
      </Link>
      <div className="flex flex-col gap-4">
        <span className="font-mono text-xs uppercase tracking-[0.12em] text-graphite">Algo falló</span>
        <h1 className="xp-display m-0 max-w-4xl text-[clamp(40px,7vw,104px)] leading-[0.92] tracking-[-0.02em]">No pudimos cargar esta página</h1>
        <p className="m-0 max-w-md text-lg text-body">Vuelve a intentarlo en unos segundos. Tu carrito sigue guardado en este dispositivo.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <button className="inline-flex h-12 items-center bg-ink px-6 text-sm font-semibold uppercase tracking-[0.04em] text-white hover:bg-[#333]" onClick={() => retry()} type="button">Reintentar</button>
        <Link className="inline-flex h-12 items-center border border-ink px-6 text-sm font-semibold uppercase tracking-[0.04em] hover:bg-ink hover:text-white" href="/">Ir al inicio</Link>
      </div>
    </div>
  </main>;
}
