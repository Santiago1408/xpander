"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function LoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          username: String(form.get("username") ?? ""),
          password: String(form.get("password") ?? ""),
        }),
      });
      if (!response.ok) {
        setError(
          response.status === 429
            ? "Demasiados intentos. Vuelve a probar en unos minutos."
            : response.status === 401
              ? "Usuario o contraseña incorrectos."
              : "No se pudo iniciar sesión. Inténtalo de nuevo.",
        );
        return;
      }
      router.replace("/admin");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={submit}>
      <div>
        <label className="block text-[13px] font-medium" htmlFor="username">
          Nombre de usuario *
        </label>
        <input
          autoComplete="username"
          className="mt-2 h-[52px] w-full border border-line px-3.5 text-[15px] outline-none focus:border-ink"
          id="username"
          maxLength={32}
          name="username"
          required
          type="text"
        />
      </div>
      <div>
        <label className="block text-[13px] font-medium" htmlFor="password">
          Contraseña *
        </label>
        <input
          autoComplete="current-password"
          className="mt-2 h-[52px] w-full border border-line px-3.5 text-[15px] outline-none focus:border-ink"
          id="password"
          name="password"
          required
          type="password"
        />
      </div>
      {error && (
        <p aria-live="polite" className="border-l-2 border-red-700 bg-red-50 p-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}
      <button
        className="xp-btn h-[52px] w-full bg-ink text-white hover:bg-[#333] disabled:opacity-50"
        disabled={pending}
        type="submit"
      >
        {pending ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}
