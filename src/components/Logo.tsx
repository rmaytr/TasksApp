/** A cairn: three stacked stones, the smallest on top — big goals, one small step at a time. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo">
      <rect width="32" height="32" rx="9" fill="var(--primary)" />
      <ellipse cx="16" cy="23.2" rx="9" ry="3.6" fill="var(--on-primary)" opacity="0.55" />
      <ellipse cx="15.2" cy="16.6" rx="6.6" ry="3.1" fill="var(--on-primary)" opacity="0.8" />
      <ellipse cx="16.6" cy="10.6" rx="4.2" ry="2.6" fill="var(--sun)" />
    </svg>
  )
}
