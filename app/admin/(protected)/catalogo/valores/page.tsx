import { PageHeader } from "../../../admin-ui";
import BrandEditor from "../marcas/brand-editor";
import TermEditor from "../etiquetas/term-editor";

export default function CatalogValuesPage() {
  return <>
    <PageHeader description="Opciones que se eligen en cada ficha. Renombrar un valor actualiza los productos que lo usan; eliminarlo los deja sin ese dato."
      eyebrow="Catálogo · Valores" title="Marcas, estilos y público" />
    <div className="grid items-start gap-4 xl:grid-cols-[1fr_2fr]">
      <div id="marcas"><BrandEditor /></div>
      <div id="estilos-publico"><TermEditor /></div>
    </div>
  </>;
}
