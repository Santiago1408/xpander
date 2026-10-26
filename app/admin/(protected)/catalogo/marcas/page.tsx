import Link from "next/link";
import BrandEditor from "./brand-editor";

export default function BrandsPage() {
  return <div className="space-y-7">
    <div>
      <Link className="text-sm text-zinc-600 underline" href="/admin">← Panel</Link>
      <h1 className="mt-4 text-3xl font-semibold">Marcas</h1>
      <p className="mt-2 text-zinc-600">Registra y corrige las marcas que aparecen en las fichas de productos.</p>
    </div>
    <BrandEditor />
  </div>;
}
