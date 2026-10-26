import Link from "next/link";
import QuickProductEditor from "./quick-product-editor";

export default function ProductsPage() {
  return (
    <div className="space-y-7">
      <div>
        <Link className="text-sm text-zinc-600 underline" href="/admin">← Panel</Link>
        <h1 className="mt-4 text-3xl font-semibold">Productos</h1>
        <p className="mt-2 max-w-3xl text-zinc-600">
          Registra el producto, sus tallas alfabéticas o numéricas, precios, imágenes y stock
          en una o más sucursales desde esta pantalla. Las marcas se administran por separado.
        </p>
      </div>
      <QuickProductEditor />
    </div>
  );
}
