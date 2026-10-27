// Draws XPANDER social posts on a canvas. Everything runs in the browser; the
// photo never leaves the device until the owner downloads the PNG.

export type TemplateKey = "ficha" | "franja" | "precio" | "oferta" | "historia";

// Typed in by the owner; the generator does not read the catalog or inventory.
// Every field is optional: whatever is empty is simply not drawn.
export type PostData = {
  name: string;
  meta: string;
  code: string;
  sizes: string[];
  priceMinor: number | null;
  priceMaxMinor: number | null;
  compareMinor: number | null;
};

export type Assets = { wordmark: HTMLImageElement; wordmarkWhite: HTMLCanvasElement; mark: HTMLImageElement; sans: string; mono: string };

export const templates: { key: TemplateKey; name: string; hint: string; width: number; height: number }[] = [
  { key: "ficha", name: "A · Ficha limpia", hint: "Fondo blanco, prenda grande, tallas y precio.", width: 1080, height: 1350 },
  { key: "franja", name: "B · Franja negra", hint: "Prenda arriba y datos en una franja negra.", width: 1080, height: 1350 },
  { key: "precio", name: "C · Precio protagonista", hint: "Fondo gris y precio gigante de contorno.", width: 1080, height: 1350 },
  { key: "oferta", name: "D · Oferta", hint: "Fondo negro y descuento destacado.", width: 1080, height: 1350 },
  { key: "historia", name: "E · Historia 9:16", hint: "Formato vertical para historias.", width: 1080, height: 1920 },
];

const INK = "#141414";
const GRAPHITE = "#5E5E5E";
const MIST = "#EDEDED";
const MUTED = "#BDBDBD";

function formatAmount(minor: number): string {
  const whole = Math.floor(minor / 100).toLocaleString("es-BO");
  const cents = minor % 100;
  return cents ? `${whole},${String(cents).padStart(2, "0")}` : whole;
}

export function formatPrice(minor: number): string {
  return `Bs. ${formatAmount(minor)}`;
}

export function discountOf(data: PostData): number {
  return data.priceMinor !== null && !data.priceMaxMinor && data.compareMinor && data.compareMinor > data.priceMinor ?
    Math.round((1 - data.priceMinor / data.compareMinor) * 100) : 0;
}

// A range shows the currency once: "Bs. 480 – 510".
export function priceText(data: PostData): string {
  if (data.priceMinor === null) return "";
  return data.priceMaxMinor && data.priceMaxMinor > data.priceMinor ? `${formatPrice(data.priceMinor)} – ${formatAmount(data.priceMaxMinor)}` : formatPrice(data.priceMinor);
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No se pudo leer la imagen."));
    image.src = src;
  });
}

// White copy of a dark logo, for dark backgrounds.
export function whiteVersion(image: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d")!;
  context.drawImage(image, 0, 0);
  context.globalCompositeOperation = "source-in";
  context.fillStyle = "#FFFFFF";
  context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

// Crops the white (or transparent) margin around a product photo.
export function trimWhite(image: HTMLImageElement): HTMLCanvasElement {
  const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const source = document.createElement("canvas");
  source.width = width; source.height = height;
  const context = source.getContext("2d", { willReadFrequently: true })!;
  context.fillStyle = "#FFFFFF";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  let top = height, left = width, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      if (pixels[offset] < 238 || pixels[offset + 1] < 238 || pixels[offset + 2] < 238) {
        if (x < left) left = x; if (x > right) right = x;
        if (y < top) top = y; if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return source;
  const pad = Math.round(Math.max(right - left, bottom - top) * 0.02);
  left = Math.max(0, left - pad); top = Math.max(0, top - pad);
  right = Math.min(width - 1, right + pad); bottom = Math.min(height - 1, bottom + pad);
  const trimmed = document.createElement("canvas");
  trimmed.width = right - left + 1; trimmed.height = bottom - top + 1;
  trimmed.getContext("2d")!.drawImage(source, left, top, trimmed.width, trimmed.height, 0, 0, trimmed.width, trimmed.height);
  return trimmed;
}

type Ctx = CanvasRenderingContext2D;

function font(ctx: Ctx, assets: Assets, size: number, options: { mono?: boolean; weight?: number; expanded?: boolean } = {}) {
  const family = options.mono ? assets.mono : assets.sans;
  ctx.font = `${options.weight ?? (options.mono ? 400 : 600)} ${options.expanded ? "expanded " : ""}${size}px ${family}`;
  if ("fontStretch" in ctx) (ctx as Ctx & { fontStretch: string }).fontStretch = options.expanded ? "expanded" : "normal";
}

function spaced(ctx: Ctx, spacing: number) {
  if ("letterSpacing" in ctx) (ctx as Ctx & { letterSpacing: string }).letterSpacing = `${spacing}px`;
}

function wrap(ctx: Ctx, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) line = candidate;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

// Display heading: shrinks until it fits in maxLines; returns the lines and the size used.
function heading(ctx: Ctx, assets: Assets, text: string, maxWidth: number, size: number, maxLines: number) {
  let current = size;
  let lines: string[] = [];
  if (!text.trim()) return { lines, size };
  while (current > 28) {
    font(ctx, assets, current, { expanded: true });
    lines = wrap(ctx, text.toLocaleUpperCase("es-BO"), maxWidth);
    if (lines.length <= maxLines && lines.every((line) => ctx.measureText(line).width <= maxWidth)) break;
    current -= 4;
  }
  return { lines, size: current };
}

function drawLines(ctx: Ctx, lines: string[], x: number, lastBaseline: number, lineHeight: number, align: CanvasTextAlign = "left") {
  ctx.textAlign = align;
  lines.forEach((line, index) => ctx.fillText(line, x, lastBaseline - (lines.length - 1 - index) * lineHeight));
  ctx.textAlign = "left";
}

function contain(ctx: Ctx, image: CanvasImageSource & { width: number; height: number }, x: number, y: number, width: number, height: number, multiply = false) {
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale, drawHeight = image.height * scale;
  ctx.save();
  if (multiply) ctx.globalCompositeOperation = "multiply";
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
  ctx.restore();
}

function logo(ctx: Ctx, image: CanvasImageSource & { width: number; height: number }, x: number, y: number, height: number, align: "left" | "center" = "left") {
  const width = image.width * (height / image.height);
  ctx.drawImage(image, align === "center" ? x - width / 2 : x, y, width, height);
  return width;
}

// Size chips in one row; they shrink when there are many sizes.
function chips(ctx: Ctx, assets: Assets, sizes: string[], x: number, y: number, maxWidth: number, options: { size: number; fill?: string; stroke?: string; color: string; align?: "left" | "right" | "center" }) {
  if (sizes.length === 0) return { size: 0, width: 0 };
  let size = options.size;
  const gap = 12;
  let widths: number[] = [];
  for (; size >= 56; size -= 4) {
    font(ctx, assets, Math.round(size * 0.4), { mono: true, weight: 500 });
    widths = sizes.map((label) => Math.max(size, ctx.measureText(label).width + size * 0.45));
    if (widths.reduce((sum, width) => sum + width, 0) + gap * (sizes.length - 1) <= maxWidth) break;
  }
  const total = widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, sizes.length - 1);
  let cursor = options.align === "right" ? x - total : options.align === "center" ? x - total / 2 : x;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  sizes.forEach((label, index) => {
    const width = widths[index];
    if (options.fill) { ctx.fillStyle = options.fill; ctx.fillRect(cursor, y, width, size); }
    if (options.stroke) { ctx.strokeStyle = options.stroke; ctx.lineWidth = 3; ctx.strokeRect(cursor + 1.5, y + 1.5, width - 3, size - 3); }
    ctx.fillStyle = options.color;
    ctx.fillText(label, cursor + width / 2, y + size / 2 + 1);
    cursor += width + gap;
  });
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  return { size, width: total };
}

function label(ctx: Ctx, assets: Assets, text: string, x: number, y: number, color: string, size = 22, align: CanvasTextAlign = "left") {
  if (!text) return;
  font(ctx, assets, size, { mono: true });
  spaced(ctx, size * 0.12);
  ctx.fillStyle = color; ctx.textAlign = align;
  ctx.fillText(text.toLocaleUpperCase("es-BO"), x, y);
  spaced(ctx, 0); ctx.textAlign = "left";
}

function price(ctx: Ctx, assets: Assets, data: PostData, x: number, baseline: number, size: number, color: string, strikeColor: string, align: CanvasTextAlign = "right", strikePrefix = "", maxWidth = 560) {
  const text = priceText(data);
  if (!text) return;
  // A price range is longer than a single price: shrink it to the available width.
  for (; size > 28; size -= 2) {
    font(ctx, assets, size, { mono: true });
    if (ctx.measureText(text).width <= maxWidth) break;
  }
  spaced(ctx, -size * 0.03);
  ctx.fillStyle = color; ctx.textAlign = align;
  ctx.fillText(text, x, baseline);
  spaced(ctx, 0);
  if (discountOf(data) > 0 && data.compareMinor) {
    const strikeSize = Math.round(size * 0.33);
    font(ctx, assets, strikeSize, { mono: true });
    ctx.fillStyle = strikeColor;
    const strike = `${strikePrefix}${formatPrice(data.compareMinor)}`;
    const y = baseline - size * 0.95;
    ctx.fillText(strike, x, y);
    const width = ctx.measureText(strike).width;
    const start = align === "right" ? x - width : align === "center" ? x - width / 2 : x;
    ctx.fillRect(start, y - strikeSize * 0.32, width, 2);
  }
  ctx.textAlign = "left";
}

function sizesTitle(data: PostData) {
  return data.sizes.length === 0 ? "" : data.sizes.length === 1 ? "Talla" : "Tallas";
}

// Top of a heading drawn bottom-up from its last baseline; without text it takes no space.
function headingTop(title: { lines: string[]; size: number }, lastBaseline: number, lineHeight: number) {
  return title.lines.length ? lastBaseline - lineHeight * (title.lines.length - 1) - title.size * 0.75 : lastBaseline;
}

export function drawPost(canvas: HTMLCanvasElement, template: TemplateKey, data: PostData, photo: HTMLCanvasElement | null, assets: Assets) {
  const spec = templates.find((item) => item.key === template)!;
  canvas.width = spec.width; canvas.height = spec.height;
  const ctx = canvas.getContext("2d")!;
  ctx.textBaseline = "alphabetic";
  const W = spec.width, H = spec.height, P = 72;
  const discount = discountOf(data);
  const placeholder = (x: number, y: number, w: number, h: number, color = MIST) => {
    ctx.fillStyle = color; ctx.fillRect(x, y, w, h);
    label(ctx, assets, "Sube la foto del producto", x + w / 2, y + h / 2, GRAPHITE, 24, "center");
  };
  const drawPhoto = (x: number, y: number, w: number, h: number, multiply = false) => photo ? contain(ctx, photo, x, y, w, h, multiply) : placeholder(x, y, w, h);

  if (template === "ficha" || template === "historia") {
    const story = template === "historia";
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, W, H);
    const pad = story ? 80 : P;
    let photoTop: number;
    if (story) {
      logo(ctx, assets.wordmark, W / 2, 160, 46, "center");
      label(ctx, assets, data.meta, W / 2, 262, GRAPHITE, 24, "center");
      photoTop = 300;
    } else {
      logo(ctx, assets.mark, pad, pad, 64);
      label(ctx, assets, data.meta, W - pad, pad + 42, GRAPHITE, 24, "right");
      photoTop = pad + 64 + 32;
    }
    // Bottom-up layout: footer, sizes and price, name, rule.
    const footerTop = story ? H - 200 - 150 : H - pad - 24;
    if (story) {
      ctx.fillStyle = INK; ctx.fillRect(pad, footerTop, W - pad * 2, 150);
      font(ctx, assets, 38, { expanded: true }); ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "center"; ctx.fillText("PIDE EN EL CATÁLOGO", W / 2, footerTop + 66); ctx.textAlign = "left";
      label(ctx, assets, "Recojo o envío · Pago QR", W / 2, footerTop + 112, MUTED, 22, "center");
    } else {
      logo(ctx, assets.wordmark, pad, footerTop, 24);
      label(ctx, assets, "Recojo o envío · Pago QR", W - pad, footerTop + 20, GRAPHITE, 22, "right");
    }
    const rowBottom = footerTop - (story ? 48 : 32);
    const hasRow = data.sizes.length > 0 || data.priceMinor !== null;
    const chipSize = hasRow ? (story ? 84 : 72) : 0;
    if (story) {
      chips(ctx, assets, data.sizes, W / 2 - 40, rowBottom - chipSize, 360, { size: chipSize, stroke: INK, color: INK, align: "right" });
      price(ctx, assets, data, W / 2, rowBottom - 8, 86, INK, GRAPHITE, "left", "", W / 2 - pad);
    } else {
      chips(ctx, assets, data.sizes, pad, rowBottom - chipSize, 420, { size: chipSize, stroke: INK, color: INK });
      label(ctx, assets, sizesTitle(data), pad, rowBottom - chipSize - 16, GRAPHITE, 20);
      price(ctx, assets, data, W - pad, rowBottom - 4, 80, INK, GRAPHITE);
    }
    const nameBottom = rowBottom - chipSize - (hasRow ? (story ? 84 : 56) : 0);
    const title = heading(ctx, assets, data.name, W - pad * 2, story ? 70 : 54, 2);
    ctx.fillStyle = INK;
    drawLines(ctx, title.lines, story ? W / 2 : pad, nameBottom, title.size * 0.95, story ? "center" : "left");
    const nameTop = headingTop(title, nameBottom, title.size * 0.95);
    if (!story) { ctx.fillStyle = INK; ctx.fillRect(pad, nameTop - 34, W - pad * 2, 3); }
    const photoBottom = nameTop - (story ? 48 : 66);
    drawPhoto(story ? pad : pad + 88, photoTop, W - (story ? pad : pad + 88) * 2, photoBottom - photoTop);
  }

  if (template === "franja") {
    const band = 380;
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, W, H - band);
    logo(ctx, assets.wordmark, W / 2, 64, 40, "center");
    drawPhoto(P + 118, 136, W - (P + 118) * 2, H - band - 136 - 32);
    if (discount > 0) {
      font(ctx, assets, 34, { mono: true, weight: 500 });
      const text = `−${discount}%`;
      const width = ctx.measureText(text).width + 40;
      ctx.fillStyle = INK; ctx.fillRect(W - P - width, 150, width, 66);
      ctx.fillStyle = "#FFFFFF"; ctx.fillText(text, W - P - width + 20, 196);
    }
    ctx.fillStyle = INK; ctx.fillRect(0, H - band, W, band);
    // With only a photo, the band carries the logo instead of staying empty.
    if (!data.name && !data.meta && !data.code && data.sizes.length === 0 && data.priceMinor === null) logo(ctx, assets.wordmarkWhite, W / 2, H - band / 2 - 30, 60, "center");
    label(ctx, assets, data.meta, P, H - band + 78, MUTED, 22);
    if (data.code) label(ctx, assets, `Cód. ${data.code}`, W - P, H - band + 78, MUTED, 22, "right");
    const title = heading(ctx, assets, data.name, W - P * 2, 58, 2);
    ctx.fillStyle = "#FFFFFF";
    const nameBottom = H - band + 110 + title.size * 0.8 + title.size * 0.95 * (title.lines.length - 1);
    drawLines(ctx, title.lines, P, nameBottom, title.size * 0.95);
    font(ctx, assets, 20, { mono: true });
    const offset = ctx.measureText(sizesTitle(data).toLocaleUpperCase("es-BO")).width + 40;
    chips(ctx, assets, data.sizes, P + offset, H - 64 - 70, 380 - offset, { size: 70, stroke: "#FFFFFF", color: "#FFFFFF" });
    label(ctx, assets, sizesTitle(data), P, H - 64 - 26, MUTED, 20);
    price(ctx, assets, data, W - P, H - 64 - 6, 76, "#FFFFFF", MUTED, "right", "", 460);
  }

  if (template === "precio") {
    ctx.fillStyle = MIST; ctx.fillRect(0, 0, W, H);
    const digits = data.priceMinor === null ? "" : String(Math.floor(data.priceMinor / 100));
    let size = 400;
    font(ctx, assets, size, { weight: 700, expanded: true });
    while (ctx.measureText(digits).width > W - 80 && size > 160) { size -= 10; font(ctx, assets, size, { weight: 700, expanded: true }); }
    ctx.lineWidth = 3; ctx.strokeStyle = INK;
    ctx.strokeText(digits, 40, H - 64 - 150 - 28);
    drawPhoto(90, 150, 760, 760, true);
    logo(ctx, assets.wordmark, P, 64, 34);
    label(ctx, assets, data.meta, W - P, 92, GRAPHITE, 22, "right");
    label(ctx, assets, sizesTitle(data), W - P - 46, 262, GRAPHITE, 20, "center");
    const chipSize = data.sizes.length > 5 ? 60 : 72;
    data.sizes.slice(0, 7).forEach((size, index) => chips(ctx, assets, [size], W - P, 286 + index * (chipSize + 12), 200, { size: chipSize, fill: INK, color: "#FFFFFF", align: "right" }));
    ctx.fillStyle = INK; ctx.fillRect(P, H - 64 - 150, W - P * 2, 3);
    const title = heading(ctx, assets, data.name, 560, 42, 3);
    ctx.fillStyle = INK;
    drawLines(ctx, title.lines, P, H - 64, title.size * 0.98);
    price(ctx, assets, data, W - P, H - 64, 52, INK, GRAPHITE, "right", "", 340);
  }

  if (template === "oferta") {
    ctx.fillStyle = INK; ctx.fillRect(0, 0, W, H);
    label(ctx, assets, discount > 0 ? "Precio especial" : "Disponible ahora", P, 86, MUTED, 22);
    font(ctx, assets, 104, { expanded: true }); ctx.fillStyle = "#FFFFFF";
    ctx.fillText(discount > 0 ? "OFERTA" : "NUEVO", P, 200);
    if (discount > 0) {
      font(ctx, assets, 50, { mono: true, weight: 500 });
      const text = `−${discount}%`;
      const width = ctx.measureText(text).width + 40;
      ctx.fillStyle = "#FFFFFF"; ctx.fillRect(W - P - width, 124, width, 80);
      ctx.fillStyle = INK; ctx.fillText(text, W - P - width + 20, 182);
    }
    // Bottom-up: footer, sizes row with the price, product name, then the photo box.
    const footerTop = H - 64 - 26;
    ctx.fillStyle = "#333333"; ctx.fillRect(P, footerTop - 24, W - P * 2, 1);
    logo(ctx, assets.wordmarkWhite, P, footerTop, 26);
    label(ctx, assets, "Hasta agotar stock", W - P, footerTop + 22, MUTED, 20, "right");
    const rowBottom = footerTop - 24 - 32;
    const hasRow = data.sizes.length > 0 || data.priceMinor !== null;
    const chipSize = hasRow ? 64 : 0;
    label(ctx, assets, sizesTitle(data), P, rowBottom - chipSize / 2 + 7, MUTED, 20);
    font(ctx, assets, 20, { mono: true });
    const offset = ctx.measureText(sizesTitle(data).toLocaleUpperCase("es-BO")).width + 32;
    chips(ctx, assets, data.sizes, P + offset, rowBottom - chipSize, 500 - offset, { size: chipSize, stroke: "#FFFFFF", color: "#FFFFFF" });
    price(ctx, assets, data, W - P, rowBottom - 4, 74, "#FFFFFF", MUTED, "right", "Antes ", 440);
    const title = heading(ctx, assets, data.name, 520, 44, 2);
    const nameBottom = rowBottom - chipSize - (hasRow ? 34 : 0);
    ctx.fillStyle = "#FFFFFF";
    drawLines(ctx, title.lines, P, nameBottom, title.size * 0.95);
    const nameTop = headingTop(title, nameBottom, title.size * 0.95);
    const boxTop = 244, boxBottom = nameTop - 40;
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(P, boxTop, W - P * 2, boxBottom - boxTop);
    drawPhoto(P + 32, boxTop + 32, W - P * 2 - 64, boxBottom - boxTop - 64);
  }
}
