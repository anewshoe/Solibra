import type { CSSProperties } from 'react';
const emotes = {
  celebrate: { src: '/solibra/emotes/celebrate.png', width: 838, height: 917 },
  announce: { src: '/solibra/emotes/announce.png', width: 913, height: 760 },
  reading: { src: '/solibra/emotes/reading.png', width: 740, height: 797 },
  wave: { src: '/solibra/emotes/wave.png', width: 893, height: 862 },
};

type SolibraEmoteProps = {
  variant: keyof typeof emotes;
  /** CSS width, e.g. 64, '6rem', or 'clamp(64px, 12vw, 112px)'. */
  size?: CSSProperties['width'];
  className?: string;
} & (
  | { decorative?: true; alt?: never }
  | { decorative: false; alt: string }
);

/** Local illustrations follow the existing native img convention. */
export function SolibraEmote({ variant, size = 'clamp(64px, 12vw, 112px)', className, decorative = true, alt }: SolibraEmoteProps) {
  const image = emotes[variant];
  return <img
    src={image.src}
    width={image.width}
    height={image.height}
    className={className}
    style={{ display: 'block', width: size, maxWidth: '100%', height: 'auto', objectFit: 'contain', flexShrink: 0 }}
    alt={decorative ? '' : alt}
    aria-hidden={decorative ? true : undefined}
    decoding="async"
  />;
}
