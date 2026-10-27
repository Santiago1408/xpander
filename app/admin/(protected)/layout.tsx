import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import AdminShell from "./admin-shell";

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

  return <AdminShell user={user}>{children}</AdminShell>;
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<p className="p-8 font-mono text-xs uppercase tracking-[0.12em] text-graphite">Verificando sesión…</p>}>
      <AuthenticatedPanel>{children}</AuthenticatedPanel>
    </Suspense>
  );
}
