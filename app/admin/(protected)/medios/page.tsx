import { PageHeader } from "../../admin-ui";
import MediaLibrary from "./media-library";

export default function Page() {
  return <>
    <PageHeader description="Sube imágenes para reutilizarlas en fichas y secciones. Las que envíes a la papelera pueden restaurarse." eyebrow="Contenido · Imágenes" title="Banco de imágenes" />
    <MediaLibrary />
  </>;
}
