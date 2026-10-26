import Link from "next/link";
import OrdersEditor from "./orders-editor";

export default function OrdersPage() {
  return <div className="space-y-7">
    <div>
      <Link className="text-sm text-zinc-600 underline" href="/admin">← Panel</Link>
      <h1 className="mt-4 text-3xl font-semibold">Pedidos</h1>
      <p className="mt-2 text-zinc-600">Revisa los pedidos registrados. Al confirmar uno, se descuentan sus unidades del inventario de la sucursal de recojo.</p>
    </div>
    <OrdersEditor />
  </div>;
}
