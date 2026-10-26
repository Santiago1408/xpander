import Link from "next/link";
import TrashList from "./trash-list";

export default function TrashPage() {
  return <div className="space-y-6">
    <div>
      <Link className="text-sm text-zinc-600 underline" href="/admin">← Panel</Link>
      <h1 className="mt-4 text-3xl font-semibold">Papelera</h1>
      <p className="mt-2 text-zinc-600">Restaura o elimina definitivamente los elementos retirados.</p>
    </div>
    <TrashList />
  </div>;
}
