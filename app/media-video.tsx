"use client";

import { useEffect, useRef } from "react";

// Landing videos play muted and looped, like an animated photo, only while
// they are on screen. With "reduce motion" on, the first frame stays still.
export default function MediaVideo({ src, label, className = "", eager = false }: {
  src: string; label?: string; className?: string; eager?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.muted = true;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    const sync = () => {
      if (visible && !motion.matches) void video.play().catch(() => undefined);
      else video.pause();
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }, { threshold: 0.1 });
    observer.observe(video);
    motion.addEventListener("change", sync);
    return () => { observer.disconnect(); motion.removeEventListener("change", sync); };
  }, [src]);

  return <video aria-label={label || undefined} className={className} disablePictureInPicture loop muted playsInline
    poster={`${src}?size=detail`} preload={eager ? "metadata" : "none"} ref={ref} src={src} />;
}
