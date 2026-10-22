import type { IconProps } from './icons/props.ts'

/** Native viewBox of the Demon Code mark. */
export const DEMON_MARK_VIEWBOX = { width: 32, height: 32 }

/**
 * Render the Demon Code mark: a terminal caret in the product's ember accent
 * over a quiet outlined square. Geometry is inline so the mark stays sharp at
 * every size and never depends on a font or a remote asset.
 * @param props.size - width in px (default 24; square).
 * @param props.className - extra class for layout placement.
 * @returns the mark svg (aria-hidden; pair with a wordmark for accessibility).
 */
export function DemonMark({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox={`0 0 ${DEMON_MARK_VIEWBOX.width} ${DEMON_MARK_VIEWBOX.height}`}
      fill="none"
      aria-hidden="true"
    >
      <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="6.25" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.5" />
      <path d="M9 8.5 L21.5 16 L9 23.5" stroke="#FF5A4E" strokeWidth="2.6" strokeLinecap="square" strokeLinejoin="miter" />
      <path d="M18.5 23.5 H24.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square" />
    </svg>
  )
}
