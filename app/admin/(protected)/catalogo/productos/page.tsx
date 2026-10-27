import { Suspense } from "react";
import QuickProductEditor from "./quick-product-editor";

export default function ProductsPage() {
  return <Suspense fallback={<p className="text-sm text-graphite">Cargando productos…</p>}><QuickProductEditor /></Suspense>;
}
