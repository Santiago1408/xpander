import Link from "next/link";
import MediaLibrary from "./media-library";

export default function MediaPage() {
  return (
    <div className="space-y-7">
      <div>
        <Link className="text-sm text-zinc-600 underline" href="/admin">← Panel</Link>
        <h1 className="mt-4 text-3xl font-semibold">Banco de imágenes</h1>
        <p className="mt-2 text-zinc-600">Consulta las imágenes cargadas y restaura las que envíes a la papelera.</p>
      </div>
      <MediaLibrary />
    </div>
  );
}
