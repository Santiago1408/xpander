import type { Metadata } from "next";
import Link from "next/link";
import LoginForm from "./login-form";

export const metadata: Metadata = {
  title: "Ingresar al panel | XPANDER",
};

export default function AdminLoginPage() {
  return (
    <main className="grid min-h-screen bg-white text-ink lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-ink p-12 text-white lg:flex">
        <Link aria-label="Ir a la tienda" className="flex items-center gap-3" href="/">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
          <img alt="" className="w-8 invert" src="/brand/xpander-x.png" />
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
          <img alt="XPANDER" className="h-4 w-auto invert" src="/brand/xpander-wordmark.png" />
        </Link>
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
        <img alt="" aria-hidden="true" className="pointer-events-none absolute -right-24 bottom-24 w-[70%] opacity-[0.06] invert" src="/brand/xpander-x.png" />
        <div className="relative flex flex-col gap-6">
          <span className="font-mono text-xs uppercase tracking-[0.12em] text-[#bdbdbd]">Administración</span>
          <h1 className="xp-display m-0 text-[clamp(48px,5.4vw,88px)] leading-[0.92] tracking-[-0.02em]">Panel de<br />control</h1>
          <p className="m-0 max-w-md text-base leading-relaxed text-[#d6d6d6]">Contenido de la landing, productos, inventario, pedidos y pagos por QR en un solo lugar.</p>
        </div>
        <span className="relative font-mono text-xs text-[#bdbdbd]">XPANDER · Bolivia</span>
      </section>
      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <Link aria-label="Ir a la tienda" className="mb-12 inline-block lg:hidden" href="/">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
            <img alt="XPANDER" className="h-5 w-auto" src="/brand/xpander-wordmark.png" />
          </Link>
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-graphite">Acceso restringido</span>
          <h2 className="xp-display m-0 mt-2 text-3xl leading-none">Ingresar</h2>
          <p className="mt-3 text-sm text-graphite">Usa tu nombre de usuario y contraseña de administración.</p>
          <LoginForm />
          <Link className="mt-10 inline-block text-sm font-medium underline underline-offset-4" href="/">← Volver a la tienda</Link>
        </div>
      </section>
    </main>
  );
}
