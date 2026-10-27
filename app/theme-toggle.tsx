"use client";

const storageKey = "xpander_theme";

// The icon follows html[data-theme] through CSS, so no React state is needed.
export default function ThemeToggle({ className = "" }: { className?: string }) {
  function toggle() {
    const root = document.documentElement;
    const next = root.dataset.theme === "light" ? "dark" : "light";
    root.dataset.theme = next;
    try { window.localStorage.setItem(storageKey, next); } catch { /* The choice lasts only this visit. */ }
  }

  return (
    <button aria-label="Cambiar entre tema oscuro y claro" className={`inline-flex size-11 items-center justify-center ${className}`}
      onClick={toggle} title="Tema oscuro / claro" type="button">
      <svg aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" />
      </svg>
    </button>
  );
}
