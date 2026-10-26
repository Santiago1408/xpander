export function identifierFromName(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64)
    .replace(/-$/, "");
  const prefixed = /^[a-z]/.test(base) ? base : base ? `item-${base}` : "item";
  return prefixed.length < 2 ? `${prefixed}-x` : prefixed.slice(0, 64);
}
