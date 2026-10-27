import { PageHeader } from "../../admin-ui";
import AccountEditor from "./account-editor";

export default function AccountPage() {
  return <>
    <PageHeader description="Tu nombre, tu usuario de acceso y tu contraseña. Todo cambio pide la contraseña actual." eyebrow="Ajustes · Mi cuenta" title="Mi cuenta" />
    <AccountEditor />
  </>;
}
