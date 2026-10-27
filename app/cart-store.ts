"use client";

import { useSyncExternalStore } from "react";

// Browser cart shared by the product page, the header and /carrito. The server
// revalidates every line, price and stock level when the order is registered.
export const cartStorageKey = "xpander_cart_v1";
export const cartChangeEvent = "xpander-cart-change";
export const maxCartLines = 20;
export const maxLineQuantity = 20;

export type CartItem = { variantId: number; quantity: number };

export function readStoredCart(isKnown: (variantId: number) => boolean): CartItem[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(cartStorageKey) || "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    const next: CartItem[] = [];
    for (const entry of raw) {
      if (typeof entry === "object" && entry !== null &&
        Number.isSafeInteger(entry.variantId) && Number.isSafeInteger(entry.quantity) &&
        entry.quantity > 0 && entry.quantity <= maxLineQuantity && isKnown(entry.variantId) &&
        !next.some((item) => item.variantId === entry.variantId)) {
        next.push({ variantId: entry.variantId, quantity: entry.quantity });
      }
      if (next.length >= maxCartLines) break;
    }
    return next;
  } catch { return []; /* A malformed local cart starts empty. */ }
}

export function writeStoredCart(items: CartItem[]) {
  try { window.localStorage.setItem(cartStorageKey, JSON.stringify(items)); } catch { /* Storage unavailable. */ }
  window.dispatchEvent(new Event(cartChangeEvent));
}

export function clearStoredCart() {
  try { window.localStorage.removeItem(cartStorageKey); } catch { /* Storage unavailable. */ }
  window.dispatchEvent(new Event(cartChangeEvent));
}

// Same limits as before: at most 20 lines and 20 units per line.
export function addToStoredCart(variantId: number, quantity: number, isKnown: (variantId: number) => boolean):
  { ok: true; quantity: number } | { ok: false; reason: string } {
  const current = readStoredCart(isKnown);
  const existing = current.find((item) => item.variantId === variantId);
  if (!existing && current.length >= maxCartLines) return { ok: false, reason: `El carrito admite hasta ${maxCartLines} productos distintos.` };
  const next = (existing?.quantity || 0) + quantity;
  if (next > maxLineQuantity) return { ok: false, reason: `Puedes pedir hasta ${maxLineQuantity} unidades de cada talla.` };
  writeStoredCart([...current.filter((item) => item.variantId !== variantId), { variantId, quantity: next }]);
  return { ok: true, quantity: next };
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(cartChangeEvent, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(cartChangeEvent, onChange);
  };
}

function readCount(): number {
  return readStoredCart(() => true).reduce((sum, item) => sum + item.quantity, 0);
}

export function useCartCount(): number {
  return useSyncExternalStore(subscribe, readCount, () => 0);
}

export const cartOpenEvent = "xpander-open-cart";

// Asks the storefront cart drawer to open (header icon, floating button, quick add).
export function openCart() {
  window.dispatchEvent(new Event(cartOpenEvent));
}
