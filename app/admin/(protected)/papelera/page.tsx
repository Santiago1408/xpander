import { PageHeader } from "../../admin-ui";
import TrashList from "./trash-list";

export default function Page() {
  return <>
    <PageHeader description="Restaura o elimina definitivamente los elementos retirados del panel." eyebrow="Ajustes · Papelera" title="Papelera" />
    <TrashList />
  </>;
}
