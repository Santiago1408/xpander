import { PageHeader } from "../../admin-ui";
import BranchEditor from "./branch-editor";

export default function Page() {
  return <>
    <PageHeader description="Crea sucursales y edita el nombre, la dirección y las indicaciones de recojo que ven los clientes al registrar un pedido." eyebrow="Ajustes · Sucursales" title="Sucursales" />
    <BranchEditor />
  </>;
}
