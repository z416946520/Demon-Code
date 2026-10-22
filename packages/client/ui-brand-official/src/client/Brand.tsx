import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * Render the Demon Code mark: a terminal caret cut in ember over the shell's
 * ink square. Kept as inline geometry so it inherits the sidebar's size and
 * never depends on a font or a second asset.
 * @param props - Host-supplied mark presentation.
 * @returns the Demon Code mark.
 */
export function OfficialBrandMark({ size }: SidebarBrandMarkOwnerProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="6.25" fill="#111114" stroke="#2c2c33" strokeWidth="1.5" />
      <path d="M9 8.5 L21.5 16 L9 23.5" stroke="#FF5A4E" strokeWidth="2.6" strokeLinecap="square" strokeLinejoin="miter" />
      <path d="M18.5 23.5 H24.5" stroke="#F1F1F2" strokeWidth="2.6" strokeLinecap="square" />
    </svg>
  )
}

/**
 * Render the product wordmark without its independently slotted mark.
 * @returns the Demon Code wordmark.
 */
export function OfficialBrandName() {
  return (
    <span style={{
      fontFamily: 'var(--dsw-font-family-brand)',
      fontSize: '12px',
      fontWeight: 700,
      letterSpacing: '0.16em',
      whiteSpace: 'nowrap',
    }}>
      DEMON CODE
    </span>
  )
}
