import { PageHeader } from "../../admin-ui";
import SuggestionsEditor from "./suggestions-editor";

export default function Page() {
  return <>
    <PageHeader description="Lo que piden los clientes desde el buzón de la página de inicio. Márcalas como atendidas cuando consigas la prenda o ya hayas respondido; copia las pendientes para llevarlas a tu próxima compra."
      eyebrow="Clientes · Buzón" title="Sugerencias" />
    <SuggestionsEditor />
  </>;
}
