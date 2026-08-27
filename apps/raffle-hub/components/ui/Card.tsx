export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-border bg-background p-6 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}
