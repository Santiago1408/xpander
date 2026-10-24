import Link from "next/link";
import VocabularyEditor from "./vocabulary-editor";

export default function VocabularyPage() {
  return (
    <div className="space-y-7">
      <div>
        <Link className="text-sm text-zinc-600 underline" href="/admin">← Panel</Link>
        <h1 className="mt-4 text-3xl font-semibold">Datos del catálogo</h1>
        <p className="mt-2 max-w-3xl text-zinc-600">
          Define las categorías, marcas y características que usarán tus productos.
          Puedes desactivar un valor sin borrar el historial de los productos.
        </p>
      </div>
      <VocabularyEditor />
    </div>
  );
}
