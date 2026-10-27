import Image, { type ImageProps } from "next/image";

type Props = Omit<ImageProps, "src" | "unoptimized" | "sizes"> & {
  src: string;
  sizes: string;
};

// The Go API stores bounded WebP sizes at upload time. Legacy JPEG/PNG media
// transparently fall back to their original file for these same URLs.
export default function MediaImage({ src, sizes, ...props }: Props) {
  const local = /^\/api\/(?:admin\/)?media\/\d+$/.test(src);
  return <picture className="block w-full">
    {local && <source sizes={sizes} srcSet={
      `${src}?size=thumb 320w, ${src}?size=card 800w, ${src}?size=detail 1200w, ${src} 1920w`
    } />}
    <Image {...props} sizes={sizes} src={src} unoptimized />
  </picture>;
}
