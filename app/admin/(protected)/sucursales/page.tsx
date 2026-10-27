import { PageHeader } from "../../admin-ui";
import BranchEditor from "./branch-editor";

export default function Page() {
  return <>
    <PageHeader description="Nombre, dirección e indicaciones de recojo que ven los clientes al registrar un pedido." eyebrow="Ajustes · Sucursales" title="Sucursales" />
    <BranchEditor />
  </>;
}
