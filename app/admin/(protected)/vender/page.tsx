import { PageHeader } from "../../admin-ui";
import SaleEditor from "./sale-editor";

export default function SalePage() {
  return <>
    <PageHeader description="Registra las ventas hechas en el local: elige la sucursal, toca las tallas vendidas, indica cómo pagó el cliente y regístrala. Queda como venta confirmada en Pedidos y descuenta el stock al instante."
      eyebrow="Operación · Vender en tienda" title="Vender en tienda" />
    <SaleEditor />
  </>;
}
