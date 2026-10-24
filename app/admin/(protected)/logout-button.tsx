"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      const response = await fetch("/api/admin/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("No se pudo cerrar la sesión");
      }
      router.replace("/admin/login");
      router.refresh();
    } catch {
      setPending(false);
      window.alert("No se pudo cerrar la sesión. Inténtalo de nuevo.");
    }
  }

  return (
    <button
      className="rounded-lg border border-zinc-300 px-4 py-2 font-medium hover:bg-zinc-100 disabled:opacity-50"
      disabled={pending}
      onClick={logout}
      type="button"
    >
      {pending ? "Saliendo…" : "Cerrar sesión"}
    </button>
  );
}
