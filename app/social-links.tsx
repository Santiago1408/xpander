import SocialIcon from "./social-icons";
import { socialPlatforms } from "./social-platforms";

const tones = {
  light: {
    link: "border-line hover:border-ink hover:bg-ink hover:text-white",
    icon: "bg-ink text-white group-hover:bg-white group-hover:text-ink [--icon-contrast:#141414] group-hover:[--icon-contrast:#fff]",
  },
  // On a dark background, such as the footer.
  dark: {
    link: "border-white/25 text-white hover:border-white hover:bg-white hover:text-ink",
    icon: "bg-white text-ink group-hover:bg-ink group-hover:text-white [--icon-contrast:#fff] group-hover:[--icon-contrast:#141414]",
  },
};

export default function SocialLinks({ links, tone = "light" }: { links?: Record<string, string>; tone?: keyof typeof tones }) {
  if (!links) return null;
  const visible = socialPlatforms.filter(({ key }) => links[key]);
  if (visible.length === 0) return null;
  return (
    <div aria-label="Redes sociales" className="flex flex-wrap gap-3">
      {visible.map(({ key, label }) => (
        <a aria-label={label} className={`group inline-flex h-12 items-center gap-3 border pl-1.5 pr-4 text-sm font-medium transition-colors ${tones[tone].link}`}
          href={links[key]} key={key} rel="noopener noreferrer" target="_blank">
          <span aria-hidden="true" className={`flex size-9 items-center justify-center transition-colors ${tones[tone].icon}`}>
            <SocialIcon className="size-[18px]" platform={key} />
          </span>
          {label}
        </a>
      ))}
    </div>
  );
}
