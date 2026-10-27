import Link from "next/link";
import TermEditor from "./term-editor";

export default function TermsPage() {
  return <div className="space-y-7">
    <div>
      <Link className="text-sm text-zinc-600 underline" href="/admin/catalogo/productos">← Productos</Link>
      <h1 className="mt-4 text-3xl font-semibold">Estilos y público</h1>
      <p className="mt-2 text-zinc-600">Define las opciones que se podrán seleccionar en cada producto.</p>
    </div>
    <TermEditor />
  </div>;
}
