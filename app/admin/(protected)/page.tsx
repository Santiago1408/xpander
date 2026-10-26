import Link from "next/link";

export default function AdminHomePage() {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
      <p className="text-sm font-medium text-zinc-500">Acceso verificado</p>
      <h1 className="mt-2 text-3xl font-semibold">Panel de XPANDER</h1>
      <p className="mt-4 max-w-2xl leading-7 text-zinc-600">
        Ya puedes editar y publicar la landing, registrar productos con sus tallas,
        precios e inventario inicial, y registrar movimientos posteriores.
        Los pedidos se incorporarán en la próxima etapa.
      </p>
      <div className="mt-7 flex flex-wrap gap-3">
        <Link className="inline-block rounded-lg bg-zinc-950 px-5 py-3 font-medium text-white"
          href="/admin/contenido">Editar landing</Link>
        <Link className="inline-block rounded-lg border border-zinc-300 px-5 py-3 font-medium"
          href="/admin/catalogo/productos">Productos</Link>
        <Link className="inline-block rounded-lg border border-zinc-300 px-5 py-3 font-medium"
          href="/admin/catalogo/marcas">Marcas</Link>
        <Link className="inline-block rounded-lg border border-zinc-300 px-5 py-3 font-medium"
          href="/admin/medios">Banco de imágenes</Link>
        <Link className="inline-block rounded-lg border border-zinc-300 px-5 py-3 font-medium"
          href="/admin/papelera">Papelera</Link>
        <Link className="inline-block rounded-lg border border-zinc-300 px-5 py-3 font-medium"
          href="/admin/inventario">Inventario</Link>
      </div>
    </section>
  );
}
