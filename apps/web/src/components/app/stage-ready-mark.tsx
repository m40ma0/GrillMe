import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * The Stage Ready mark: a spotlight on a stage with a check ("ready").
 * Use it wherever the old Sparkles tile appeared (landing header, app sidebar, sign-in page, empty states).
 * `simple` drops the beam for sizes under 24 px, matching the favicon.
 */
export function StageReadyMark({ className, simple, title = "Stage Ready" }: { className?: string; simple?: boolean; title?: string | null }) {
  const id = useId().replace(/:/g, "");
  const tile = `sr-tile-${id}`;
  const beam = `sr-beam-${id}`;
  return (
    <svg viewBox="0 0 512 512" className={cn("size-8 shrink-0", className)} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title ?? undefined}>
      <defs>
        <linearGradient id={tile} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8B92FA" />
          <stop offset="1" stopColor="#4338CA" />
        </linearGradient>
        <linearGradient id={beam} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0.08" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill={`url(#${tile})`} />
      {simple ? (
        <>
          <rect x="200" y="64" width="112" height="48" rx="19" fill="#FFFFFF" />
          <path d="M160 259 L224 320 L352 192" fill="none" stroke="#FFFFFF" strokeWidth="54" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="88" y="374" width="336" height="58" rx="29" fill="#FFFFFF" />
        </>
      ) : (
        <>
          <path d="M214 96 H298 L408 372 H104 Z" fill={`url(#${beam})`} />
          <rect x="200" y="62" width="112" height="44" rx="16" fill="#FFFFFF" />
          <ellipse cx="256" cy="386" rx="172" ry="36" fill="#FFFFFF" />
          <path d="M178 254 L232 306 L338 196" fill="none" stroke="#FFFFFF" strokeWidth="46" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}
