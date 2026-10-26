import Link from "next/link";
import InventoryEditor from "./inventory-editor";

export default function InventoryPage() {
  return <div className="space-y-7">
    <div>
      <Link className="text-sm text-zinc-600 underline" href="/admin">← Panel</Link>
      <h1 className="mt-4 text-3xl font-semibold">Inventario</h1>
      <p className="mt-2 text-zinc-600">Registra entradas y ajustes por variante y sucursal.</p>
    </div>
    <InventoryEditor />
  </div>;
}
