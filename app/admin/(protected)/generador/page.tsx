import { PageHeader } from "../../admin-ui";
import Generator from "./generator";

export default function GeneratorPage() {
  return <>
    <PageHeader description="Crea imágenes para redes con el estilo de la tienda: sube la foto de la prenda con fondo blanco, escribe sus tallas y su precio, elige la plantilla y descarga el PNG. No usa datos del catálogo ni del inventario."
      eyebrow="Contenido · Generador" title="Generador" />
    <Generator />
  </>;
}
