"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { notify } from "../../toast";

export default function LogoutButton({ className = "" }: { className?: string }) {
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
      notify.error("No se pudo cerrar la sesión. Inténtalo de nuevo.");
    }
  }

  return (
    <button
      className={className}
      disabled={pending}
      onClick={logout}
      type="button"
    >
      {pending ? "Saliendo…" : "Cerrar sesión"}
    </button>
  );
}
