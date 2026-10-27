"use client";

import { useEffect, useState } from "react";

type ToastKind = "success" | "error" | "info";
type ToastAction = { label: string; onClick: () => void };
type ToastItem = { id: number; kind: ToastKind; message: string; action?: ToastAction };

const toastEvent = "xpander-toast";

function emit(kind: ToastKind, message: string, action?: ToastAction) {
  if (typeof window === "undefined" || !message) return;
  window.dispatchEvent(new CustomEvent<Omit<ToastItem, "id">>(toastEvent, { detail: { kind, message, action } }));
}

// Short-lived notices for the result of an action, shown by the <Toaster /> in the root layout.
export const notify = {
  success: (message: string, action?: ToastAction) => emit("success", message, action),
  error: (message: string, action?: ToastAction) => emit("error", message, action),
  info: (message: string, action?: ToastAction) => emit("info", message, action),
};

const icons: Record<ToastKind, string> = {
  success: "M5 12.5l4.5 4.5L19 7.5",
  error: "M12 7v6M12 16.5v.5M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0z",
  info: "M12 11v6M12 7.5v.5M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
};

let nextId = 1;

export default function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    function show(event: Event) {
      const detail = (event as CustomEvent<Omit<ToastItem, "id">>).detail;
      const item = { ...detail, id: nextId++ };
      setItems((current) => [...current.filter((other) => other.message !== item.message), item].slice(-4));
      window.setTimeout(() => setItems((current) => current.filter((other) => other.id !== item.id)),
        item.kind === "error" ? 8000 : item.action ? 6000 : 4000);
    }
    window.addEventListener(toastEvent, show);
    return () => window.removeEventListener(toastEvent, show);
  }, []);

  const dismiss = (id: number) => setItems((current) => current.filter((item) => item.id !== id));

  return <div aria-live="polite" className="pointer-events-none fixed inset-x-3 top-3 z-[90] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-5 sm:top-5 sm:w-[380px]">
    {items.map((item) => <div className={`pointer-events-auto flex items-start gap-3 border-l-[3px] bg-ink p-4 text-sm text-white shadow-[0_12px_40px_rgba(0,0,0,.28)] ${
      item.kind === "error" ? "border-red-500" : item.kind === "success" ? "border-white" : "border-[#8a8a8a]"}`}
      key={item.id} role={item.kind === "error" ? "alert" : "status"}>
      <svg aria-hidden="true" className={`mt-0.5 size-5 shrink-0 ${item.kind === "error" ? "text-red-400" : "text-white"}`} fill="none" stroke="currentColor"
        strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24"><path d={icons[item.kind]} /></svg>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="m-0 leading-snug">{item.message}</p>
        {item.action && <button className="self-start font-semibold underline underline-offset-4" onClick={() => { item.action?.onClick(); dismiss(item.id); }}
          type="button">{item.action.label}</button>}
      </div>
      <button aria-label="Cerrar aviso" className="-m-1 inline-flex size-7 shrink-0 items-center justify-center text-[#bdbdbd] hover:text-white" onClick={() => dismiss(item.id)} type="button">
        <svg aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>)}
  </div>;
}
