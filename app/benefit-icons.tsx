import type { ReactNode } from "react";

// Icons available for the editable "benefits" section (kept in sync with the API list).
export const benefitIconOptions: { key: string; label: string; path: ReactNode }[] = [
  { key: "store", label: "Tienda", path: <path d="M3 10l9-6 9 6v10H3zM9 20v-6h6v6" /> },
  { key: "delivery", label: "Envío", path: <><path d="M2 6h12v10H2zM14 10h4l3 3v3h-7" /><circle cx="6" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></> },
  { key: "qr", label: "Pago QR", path: <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM18 18h3v3h-3zM14 20h2M20 14v2" /> },
  { key: "chat", label: "WhatsApp", path: <path d="M4 20l1.5-4A8 8 0 1 1 9 19.5L4 20z" /> },
  { key: "card", label: "Pago", path: <><rect height="14" rx="1" width="20" x="2" y="5" /><path d="M2 10h20M6 15h4" /></> },
  { key: "exchange", label: "Cambios", path: <><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" /><path d="M18 3v4h-4M6 21v-4h4" /></> },
  { key: "clock", label: "Horario", path: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
  { key: "star", label: "Calidad", path: <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" /> },
  { key: "shield", label: "Seguridad", path: <><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></> },
  { key: "tag", label: "Precio", path: <><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.5" /></> },
];

export function BenefitIcon({ icon, className = "size-7" }: { icon: string; className?: string }) {
  const option = benefitIconOptions.find((item) => item.key === icon) ?? benefitIconOptions[0];
  return <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.4" viewBox="0 0 24 24">{option.path}</svg>;
}
