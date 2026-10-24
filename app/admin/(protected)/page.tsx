import Link from "next/link";

export default function AdminHomePage() {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
      <p className="text-sm font-medium text-zinc-500">Acceso verificado</p>
      <h1 className="mt-2 text-3xl font-semibold">Panel de XPANDER</h1>
      <p className="mt-4 max-w-2xl leading-7 text-zinc-600">
        Ya puedes editar y publicar la landing, administrar los datos del catálogo
        y crear fichas con variantes y precios. El inventario y los pedidos se
        incorporarán en las próximas etapas.
      </p>
      <div className="mt-7 flex flex-wrap gap-3">
        <Link className="inline-block rounded-lg bg-zinc-950 px-5 py-3 font-medium text-white"
          href="/admin/contenido">Editar landing</Link>
        <Link className="inline-block rounded-lg border border-zinc-300 px-5 py-3 font-medium"
          href="/admin/catalogo/vocabulario">Datos del catálogo</Link>
        <Link className="inline-block rounded-lg border border-zinc-300 px-5 py-3 font-medium"
          href="/admin/catalogo/productos">Productos</Link>
      </div>
    </section>
  );
}
