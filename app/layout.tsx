import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";
import Toaster from "./toast";

// Fonts are bundled (latin subset, SIL OFL; licenses in app/fonts) so the site
// never depends on reaching Google Fonts when it builds or runs.
const archivo = localFont({
  variable: "--font-archivo",
  src: [{ path: "./fonts/archivo-latin.woff2", weight: "100 900", style: "normal" }],
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
  fallback: ["system-ui", "sans-serif"],
});

const plexMono = localFont({
  variable: "--font-plex-mono",
  src: [
    { path: "./fonts/plex-mono-400-latin.woff2", weight: "400", style: "normal" },
    { path: "./fonts/plex-mono-500-latin.woff2", weight: "500", style: "normal" },
  ],
  fallback: ["ui-monospace", "monospace"],
});

export const metadata: Metadata = {
  title: "XPANDER",
  description: "Tienda de ropa XPANDER",
};

// Applies the visitor's saved band theme before the first paint.
const themeScript = `try{var t=localStorage.getItem("xpander_theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${archivo.variable} ${plexMono.variable} h-full antialiased`}
      data-theme="dark"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
        <Script id="xpander-theme" strategy="beforeInteractive">{themeScript}</Script>
      </body>
    </html>
  );
}
