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
        <a aria-label={label} className="inline-flex h-11 items-center gap-2.5 border border-line pl-1.5 pr-4 text-sm font-medium hover:border-ink"
          href={links[key]} key={key} rel="noopener noreferrer" target="_blank">
          <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full border border-graphite font-mono text-[11px]">{symbols[key]}</span>
          {label}
        </a>
      ))}
    </div>
  );
}
