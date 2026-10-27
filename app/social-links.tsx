import { socialPlatforms } from "./social-platforms";

const symbols: Record<string, string> = {
  facebook: "f", instagram: "◎", tiktok: "♪", youtube: "▶", x: "𝕏",
  threads: "@", linkedin: "in", pinterest: "P", telegram: "➤", whatsapp: "◉",
};

export default function SocialLinks({ links }: { links?: Record<string, string> }) {
  if (!links) return null;
  const visible = socialPlatforms.filter(({ key }) => links[key]);
  if (visible.length === 0) return null;
  return (
    <div aria-label="Redes sociales" className="flex flex-wrap gap-3">
      {visible.map(({ key, label }) => (
        <a aria-label={label} className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100"
          href={links[key]} key={key} rel="noopener noreferrer" target="_blank">
          <span aria-hidden="true" className="flex size-6 items-center justify-center rounded-full bg-zinc-950 text-xs font-bold text-white">{symbols[key]}</span>
          {label}
        </a>
      ))}
    </div>
  );
}
