import Link from "next/link";
import ProductsEditor from "./products-editor";

export default function ProductsPage() {
  return (
    <div className="space-y-7">
      <div>
        <Link className="text-sm text-zinc-600 underline" href="/admin">← Panel</Link>
        <h1 className="mt-4 text-3xl font-semibold">Productos y variantes</h1>
        <p className="mt-2 max-w-3xl text-zinc-600">
          Crea fichas en borrador, agrega combinaciones vendibles y publícalas en el catálogo.
          Las existencias se gestionarán en el módulo de inventario.
        </p>
      </div>
      <ProductsEditor />
    </div>
  );
}
