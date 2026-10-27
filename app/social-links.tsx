import SocialIcon from "./social-icons";
import { socialPlatforms } from "./social-platforms";

export default function SocialLinks({ links }: { links?: Record<string, string> }) {
  if (!links) return null;
  const visible = socialPlatforms.filter(({ key }) => links[key]);
  if (visible.length === 0) return null;
  return (
    <div aria-label="Redes sociales" className="flex flex-wrap gap-3">
      {visible.map(({ key, label }) => (
        <a aria-label={label} className="group inline-flex h-12 items-center gap-3 border border-line pl-1.5 pr-4 text-sm font-medium transition-colors hover:border-ink hover:bg-ink hover:text-white"
          href={links[key]} key={key} rel="noopener noreferrer" target="_blank">
          <span aria-hidden="true" className="flex size-9 items-center justify-center bg-ink text-white transition-colors group-hover:bg-white group-hover:text-ink [--icon-contrast:#141414] group-hover:[--icon-contrast:#fff]">
            <SocialIcon className="size-[18px]" platform={key} />
          </span>
          {label}
        </a>
      ))}
    </div>
  );
}
