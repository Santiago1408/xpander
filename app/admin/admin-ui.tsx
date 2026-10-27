import type { ReactNode } from "react";

// Shared look for every administration screen (design: "Panel de administración").
export const ui = {
  input: "h-11 w-full border border-line bg-white px-3 text-sm text-ink outline-none transition-colors focus:border-ink disabled:bg-soft disabled:text-graphite",
  textarea: "w-full border border-line bg-white p-3 text-sm text-ink outline-none transition-colors focus:border-ink disabled:bg-soft",
  label: "flex flex-col gap-1.5 text-[13px] font-medium text-ink",
  hint: "text-xs font-normal leading-relaxed text-graphite",
  primary: "inline-flex h-11 items-center justify-center gap-2 bg-ink px-5 text-[13px] font-semibold tracking-[0.04em] text-white transition-colors hover:bg-[#333] disabled:cursor-not-allowed disabled:opacity-40",
  secondary: "inline-flex h-11 items-center justify-center gap-2 border border-ink bg-white px-5 text-[13px] font-semibold tracking-[0.04em] text-ink transition-colors hover:bg-ink hover:text-white disabled:cursor-not-allowed disabled:opacity-40",
  quiet: "inline-flex h-9 items-center justify-center gap-1.5 border border-line bg-white px-3 text-[13px] font-medium text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-40",
  danger: "inline-flex h-11 items-center justify-center gap-2 bg-red-700 px-5 text-[13px] font-semibold text-white transition-colors hover:bg-red-800 disabled:opacity-40",
  link: "text-[13px] font-medium text-ink underline underline-offset-4 hover:text-graphite disabled:opacity-40",
  dangerLink: "text-[13px] font-medium text-red-700 underline underline-offset-4 hover:text-red-900 disabled:opacity-40",
  card: "bg-white",
  cardPad: "p-5 sm:p-6",
  cardTitle: "m-0 text-base font-semibold",
  eyebrow: "font-mono text-[11px] uppercase tracking-[0.12em] text-graphite",
  th: "px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-graphite first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6",
  td: "border-t border-mist px-4 py-3.5 align-top first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6",
  chip: (selected: boolean) => `inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors ${
    selected ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink"}`,
};

export function PageHeader({ eyebrow, title, description, actions }: {
  eyebrow: string; title: string; description?: ReactNode; actions?: ReactNode;
}) {
  return <div className="flex flex-wrap items-end justify-between gap-4">
    <div className="flex max-w-3xl flex-col gap-1.5">
      <span className={ui.eyebrow}>{eyebrow}</span>
      <h1 className="xp-display m-0 text-[clamp(28px,3vw,40px)] leading-none">{title}</h1>
      {description && <p className="m-0 mt-1.5 text-[13px] leading-relaxed text-graphite sm:text-sm">{description}</p>}
    </div>
    {actions && <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">{actions}</div>}
  </div>;
}

export { default as Feedback } from "./admin-feedback";

export function Card({ title, description, actions, children, className = "", padded = true }: {
  title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean;
}) {
  return <section className={`${ui.card} ${className}`}>
    {(title || actions) && <div className={`flex flex-wrap items-start justify-between gap-3 ${padded ? "px-5 pt-5 sm:px-6 sm:pt-6" : "border-b border-line px-5 py-4 sm:px-6"}`}>
      <div className="flex flex-col gap-1">
        {title && <h2 className={ui.cardTitle}>{title}</h2>}
        {description && <p className="m-0 text-[13px] leading-relaxed text-graphite">{description}</p>}
      </div>
      {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div>}
    </div>}
    <div className={padded ? ui.cardPad : ""}>{children}</div>
  </section>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="border border-dashed border-[#d0d0d0] bg-white p-8 text-center text-sm text-graphite">{children}</div>;
}

export type PillTone = "outline" | "dashed" | "soft" | "solid" | "danger" | "muted";

export function Pill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  const styles: Record<PillTone, [string, string]> = {
    dashed: ["border border-dashed border-ink bg-white text-ink", "border border-ink"],
    soft: ["border border-mist bg-mist text-ink", "border border-ink bg-[linear-gradient(90deg,#141414_50%,transparent_50%)]"],
    outline: ["border border-ink bg-white text-ink", "bg-ink"],
    solid: ["border border-ink bg-ink text-white", "bg-white"],
    danger: ["border border-red-700 bg-white text-red-700", "bg-red-700"],
    muted: ["border border-line bg-soft text-graphite", "bg-[#bdbdbd]"],
  };
  const [pill, icon] = styles[tone];
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${pill}`}>
    <span aria-hidden="true" className={`size-2 rounded-full ${icon}`} />{children}
  </span>;
}

export function Modal({ title, children, onClose, labelledBy }: { title: string; children: ReactNode; onClose?: () => void; labelledBy: string }) {
  return <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/60 sm:items-center sm:p-4" onClick={(event) => {
    if (event.target === event.currentTarget) onClose?.();
  }} role="presentation">
    <div aria-labelledby={labelledBy} aria-modal="true" className="max-h-[90vh] w-full overflow-y-auto bg-white p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl sm:max-w-md sm:pb-6" role="dialog">
      <h2 className="xp-display m-0 text-xl" id={labelledBy}>{title}</h2>
      {children}
    </div>
  </div>;
}

export function formatBOB(minor: number): string {
  return `Bs. ${new Intl.NumberFormat("es-BO", { minimumFractionDigits: minor % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(minor / 100)}`;
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleString("es-BO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// Filter chips scroll horizontally on small screens instead of wrapping into several rows.
export function ChipRow({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return <div aria-label={label} className={`-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 ${className}`} role="group">
    {children}
  </div>;
}

// Native file inputs show browser-language text; this keeps the panel's own wording.
export function FileField({ label, hint, accept, disabled, fileName, onFile, id }: {
  label: string; hint?: string; accept: string; disabled?: boolean; fileName?: string; id?: string;
  onFile: (file: File | null) => void;
}) {
  return <label className={`flex cursor-pointer items-center gap-3 border border-dashed p-3 transition-colors ${disabled ? "cursor-not-allowed border-line opacity-50" : fileName ? "border-ink bg-soft" : "border-[#bdbdbd] hover:border-ink"}`}>
    <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center bg-ink text-white">
      <svg className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>
    </span>
    <span className="flex min-w-0 flex-col">
      <span className="truncate text-[13px] font-semibold">{fileName || label}</span>
      {hint && <span className="text-xs text-graphite">{fileName ? "Toca para cambiar el archivo" : hint}</span>}
    </span>
    <input accept={accept} className="sr-only" disabled={disabled} id={id}
      onChange={(event) => { onFile(event.target.files?.[0] || null); event.target.value = ""; }} type="file" />
  </label>;
}

export function ConfirmDialog({ title, children, confirmLabel, busy, danger = false, disabled = false, onCancel, onConfirm }: {
  title: string; children: ReactNode; confirmLabel: string; busy: boolean; danger?: boolean; disabled?: boolean;
  onCancel: () => void; onConfirm: () => void;
}) {
  return <Modal labelledBy="confirm-dialog-title" onClose={() => !busy && onCancel()} title={title}>
    <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-body">{children}</div>
    <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button className={ui.secondary} disabled={busy} onClick={onCancel} type="button">Cancelar</button>
      <button className={danger ? ui.danger : ui.primary} disabled={busy || disabled} onClick={onConfirm} type="button">{busy ? "Procesando…" : confirmLabel}</button>
    </div>
  </Modal>;
}

// Full-screen sheet for details on phones; desktop layouts render the content inline.
export function MobileSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div aria-label={title} aria-modal="true" className="fixed inset-0 z-[55] flex flex-col bg-soft xl:hidden" role="dialog">
    <div className="flex items-center gap-3 border-b border-line bg-white px-4 py-3">
      <button aria-label="Volver" className="inline-flex size-10 items-center justify-center border border-line" onClick={onClose} type="button">←</button>
      <span className="font-mono text-xs uppercase tracking-[0.12em] text-graphite">{title}</span>
    </div>
    <div className="flex-1 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">{children}</div>
  </div>;
}

const iconPaths: Record<string, ReactNode> = {
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>,
  hide: <><path d="M3 3l18 18" /><path d="M10.6 5.1A10 10 0 0 1 12 5c5 0 9 5 10 7a14 14 0 0 1-3 3.8M6.3 6.3C3.9 7.8 2.5 10.4 2 12c1 2 5 7 10 7 1.7 0 3.2-.5 4.6-1.3" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  show: <><path d="M2 12c1-2 5-7 10-7s9 5 10 7c-1 2-5 7-10 7S3 14 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  delete: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  restore: <><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6" /><path d="M4 4v4.6h4.6" /></>,
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  down: <path d="M12 5v14M6 13l6 6 6-6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
};

export type IconName = keyof typeof iconPaths;

// Square icon action with a visible tooltip and an accessible label; "danger" is red.
export function IconButton({ icon, label, onClick, disabled, tone = "default", pressed }: {
  icon: IconName; label: string; onClick: () => void; disabled?: boolean; tone?: "default" | "danger"; pressed?: boolean;
}) {
  return <button aria-label={label} aria-pressed={pressed} title={label}
    className={`inline-flex size-9 shrink-0 items-center justify-center border transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
      tone === "danger" ? "border-red-200 bg-white text-red-700 enabled:hover:border-red-700 enabled:hover:bg-red-700 enabled:hover:text-white"
        : "border-line bg-white text-ink enabled:hover:border-ink"}`}
    disabled={disabled} onClick={onClick} type="button">
    <svg aria-hidden="true" className="size-[18px]" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" viewBox="0 0 24 24">{iconPaths[icon]}</svg>
  </button>;
}
