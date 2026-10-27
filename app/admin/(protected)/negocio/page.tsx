import { PageHeader } from "../../admin-ui";
import BusinessEditor from "./business-editor";

export default function Page() {
  return <>
    <PageHeader description="Teléfono, redes sociales, logos de la tienda y QR bancario. Estos datos se guardan al pulsar «Guardar cambios» y no dependen de publicar la landing." eyebrow="Ajustes · Negocio" title="Datos del negocio" />
    <BusinessEditor />
  </>;
}
