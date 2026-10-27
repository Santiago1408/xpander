import type { ReactNode } from "react";

// Shared look for every administration screen (design: "Panel de administración").
export const ui = {
  input: "h-11 w-full border border-line bg-white px-3 text-sm text-ink outline-none transition-colors focus:border-ink disabled:bg-soft disabled:text-graphite",
  textarea: "w-full border border-line bg-white p-3 text-sm text-ink outline-none transition-colors focus:border-ink disabled:bg-soft",
  file: "block w-full text-sm text-graphite file:mr-3 file:h-10 file:cursor-pointer file:border file:border-ink file:bg-white file:px-4 file:text-sm file:font-medium file:text-ink hover:file:bg-ink hover:file:text-white",
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
      {description && <p className="m-0 mt-1.5 text-sm leading-relaxed text-graphite">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>;
}

export function Feedback({ error, notice }: { error?: string; notice?: string }) {
  return <>
    {error && <p className="m-0 flex gap-3 border-l-2 border-red-700 bg-red-50 p-4 text-sm text-red-800" role="alert">{error}</p>}
    {notice && <p className="m-0 flex gap-3 border-l-2 border-ink bg-white p-4 text-sm text-ink" role="status">{notice}</p>}
  </>;
}

export function Card({ title, description, actions, children, className = "", padded = true }: {
  title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean;
}) {
  return <section className={`${ui.card} ${className}`}>
    {(title || actions) && <div className={`flex flex-wrap items-start justify-between gap-3 ${padded ? "px-5 pt-5 sm:px-6 sm:pt-6" : "border-b border-line px-5 py-4 sm:px-6"}`}>
      <div className="flex flex-col gap-1">
        {title && <h2 className={ui.cardTitle}>{title}</h2>}
        {description && <p className="m-0 text-[13px] leading-relaxed text-graphite">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
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
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/60 p-4" onClick={(event) => {
    if (event.target === event.currentTarget) onClose?.();
  }} role="presentation">
    <div aria-labelledby={labelledBy} aria-modal="true" className="w-full max-w-md bg-white p-6 shadow-2xl" role="dialog">
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
