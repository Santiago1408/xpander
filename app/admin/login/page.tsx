import type { Metadata } from "next";
import LoginForm from "./login-form";

export const metadata: Metadata = {
  title: "Ingresar al panel | XPANDER",
};

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-4 py-12 text-zinc-950">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold tracking-[0.25em]">XPANDER</p>
        <h1 className="mt-8 text-3xl font-semibold">Panel de administración</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Ingresa con tu nombre de usuario y contraseña.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
