import Link from "next/link";
import BranchEditor from "./branch-editor";

export default function BranchesPage() {
  return <div className="space-y-7">
    <div>
      <Link className="text-sm text-zinc-600 underline" href="/admin">← Panel</Link>
      <h1 className="mt-4 text-3xl font-semibold">Sucursal activa</h1>
      <p className="mt-2 text-zinc-600">Actualiza el nombre, la dirección y las indicaciones de recojo visibles para los clientes.</p>
    </div>
    <BranchEditor />
  </div>;
}
