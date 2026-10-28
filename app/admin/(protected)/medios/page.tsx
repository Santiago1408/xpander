import { PageHeader } from "../../admin-ui";
import MediaLibrary from "./media-library";

export default function Page() {
  return <>
    <PageHeader description="Sube imágenes para reutilizarlas en fichas y secciones. Los videos (hasta 5, de 30 segundos como máximo) se suben desde Contenido web, en la portada, la galería o los bloques de imágenes. Lo que envíes a la papelera puede restaurarse." eyebrow="Contenido · Imágenes" title="Banco de imágenes" />
    <MediaLibrary />
  </>;
}
