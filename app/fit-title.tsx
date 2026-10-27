"use client";

import { useEffect, useRef } from "react";

// A one-line heading scaled so its text spans the full width of its container.
// The server renders an estimate from the character count; the browser then
// measures the real text and corrects it whenever the width or the font changes.
export default function FitTitle({ text, className = "" }: { text: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const container = box.current, span = line.current;
    if (!container || !span) return;
    function fit() {
      if (!container || !span) return;
      span.style.fontSize = "100px";
      const width = span.getBoundingClientRect().width;
      if (width > 0) span.style.fontSize = `${Math.floor((100 * container.clientWidth / width) * 100) / 100}px`;
    }
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    void document.fonts?.ready.then(fit);
    return () => observer.disconnect();
  }, [text]);

  return <div className="w-full [container-type:inline-size]" ref={box}>
    <h2 className={`m-0 leading-[0.86] ${className}`}>
      <span className="inline-block whitespace-nowrap" ref={line} style={{ fontSize: `calc(100cqi / ${Math.max(1, text.length) * 0.82})` }}>{text}</span>
    </h2>
  </div>;
}
