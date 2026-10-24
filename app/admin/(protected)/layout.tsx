import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import LogoutButton from "./logout-button";

type AdminUser = {
  username: string;
  displayName: string;
  role: string;
};

async function AuthenticatedPanel({ children }: { children: ReactNode }) {
  const token = (await cookies()).get("xpander_session")?.value;
  if (!token) {
    redirect("/admin/login");
  }

  const apiOrigin = process.env.XPANDER_API_ORIGIN ?? "http://127.0.0.1:8080";
  const response = await fetch(`${apiOrigin}/api/admin/me`, {
    headers: { Cookie: `xpander_session=${token}` },
    cache: "no-store",
  });
  if (response.status === 401) {
    redirect("/admin/login");
  }
  if (!response.ok) {
    throw new Error("No se pudo comprobar la sesión administrativa");
  }
  const user = (await response.json()) as AdminUser;

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-950">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4">
          <div>
            <p className="text-sm font-semibold tracking-[0.25em]">XPANDER</p>
            <p className="text-xs text-zinc-500">Administración</p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-zinc-600 sm:inline">{user.displayName}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-10">{children}</main>
    </div>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<p className="p-8 text-zinc-600">Verificando sesión…</p>}>
      <AuthenticatedPanel>{children}</AuthenticatedPanel>
    </Suspense>
  );
}
