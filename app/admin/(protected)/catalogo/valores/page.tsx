import Link from "next/link";
import BrandEditor from "../marcas/brand-editor";
import TermEditor from "../etiquetas/term-editor";

export default function CatalogValuesPage() {
  return <div className="space-y-8">
    <div>
      <Link className="text-sm text-zinc-600 underline" href="/admin/catalogo/productos">← Productos</Link>
      <h1 className="mt-4 text-3xl font-semibold">Marcas, estilos y público</h1>
      <p className="mt-2 text-zinc-600">Administra aquí todas las opciones seleccionables en las fichas.</p>
    </div>
    <div id="marcas"><BrandEditor /></div>
    <div id="estilos-publico"><TermEditor /></div>
  </div>;
}
