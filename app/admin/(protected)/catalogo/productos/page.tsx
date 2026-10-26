import Link from "next/link";
import QuickProductEditor from "./quick-product-editor";

export default function ProductsPage() {
  return (
    <div className="space-y-7">
      <div>
        <Link className="text-sm text-zinc-600 underline" href="/admin">← Panel</Link>
        <h1 className="mt-4 text-3xl font-semibold">Productos</h1>
        <p className="mt-2 max-w-3xl text-zinc-600">
          Registra el producto, sus tallas, precios, imágenes y stock inicial desde esta pantalla.
          Los valores nuevos de estilo, público, marca y color se guardan automáticamente.
        </p>
      </div>
      <QuickProductEditor />
    </div>
  );
}
