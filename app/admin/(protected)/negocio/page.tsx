import Link from "next/link";
import BusinessEditor from "./business-editor";

export default function BusinessPage() {
  return <div className="space-y-7">
    <div>
      <Link className="text-sm text-zinc-600 underline" href="/admin">← Panel</Link>
      <h1 className="mt-4 text-3xl font-semibold">Datos del negocio</h1>
      <p className="mt-2 text-zinc-600">Administra el teléfono, las redes del negocio y la imagen del QR bancario.</p>
    </div>
    <BusinessEditor />
  </div>;
}
