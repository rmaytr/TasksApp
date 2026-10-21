/** Three rings with a dot pulled toward the center: the whole product in one mark. */
export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo">
      <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.6" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.6" />
      <circle cx="16" cy="16" r="4" fill="currentColor" />
      <circle cx="23.5" cy="9.5" r="2.6" fill="var(--area-amber)" />
    </svg>
  )
}
