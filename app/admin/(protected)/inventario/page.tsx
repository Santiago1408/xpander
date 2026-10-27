import { PageHeader } from "../../admin-ui";
import InventoryEditor from "./inventory-editor";

export default function Page() {
  return <>
    <PageHeader description="Registra entradas de mercancía y ajustes por variante y sucursal. El historial no se edita: las correcciones se registran como ajustes." eyebrow="Operación · Inventario" title="Inventario" />
    <InventoryEditor />
  </>;
}
