import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { connection } from "next/server";
import { ImageResponse } from "next/og";
import { apiOrigin } from "../store-data";

// The store's logo as a data URL: the one chosen in "Datos del negocio" or,
// while there is none (the API redirects), the bundled original.
async function logoDataURL(): Promise<string> {
  try {
    const response = await fetch(`${apiOrigin}/api/brand/logotipo`, { cache: "no-store", redirect: "manual" });
    if (response.ok && response.headers.get("content-type") === "image/png") {
      return `data:image/png;base64,${Buffer.from(await response.arrayBuffer()).toString("base64")}`;
    }
  } catch {
    // Fall back to the bundled logo when the API is unavailable.
  }
  const file = await readFile(join(process.cwd(), "public", "brand", "xpander-wordmark.png"));
  return `data:image/png;base64,${file.toString("base64")}`;
}

// Preview image used when the home page or the catalog is shared (1200×630).
export async function GET() {
  await connection();
  const logo = await logoDataURL();
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 48, background: "#ffffff", color: "#141414" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- rendered by ImageResponse, not the browser */}
      <img alt="" src={logo} style={{ maxWidth: 820, maxHeight: 220, objectFit: "contain" }} />
      <div style={{ display: "flex", fontSize: 30, letterSpacing: 6, color: "#5E5E5E" }}>TIENDA DE ROPA · BOLIVIA</div>
    </div>,
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=300" } },
  );
}
