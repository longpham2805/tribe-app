export function Tag({
  children,
  color,
  dot,
  icon,
}: {
  children: React.ReactNode;
  color: string;
  dot?: boolean;
  icon?: React.ReactNode;
}) {
  const bg = color.startsWith("var(")
    ? `color-mix(in srgb, ${color} 12%, transparent)`
    : `${color}22`;
  return (
    <span className="sc-tag" style={{ background: bg, color }}>
      {dot && <span className="sc-tag__dot" style={{ background: color }} />}
      {icon && <span className="sc-tag__icon" aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}
