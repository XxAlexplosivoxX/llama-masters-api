interface Props {
  title: string;
  subtitle?: string;
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function Card({ title, subtitle, aside, className, children }: Props) {
  return (
    <section className={`rounded-2xl border border-grid bg-card p-4 sm:p-5 ${className ?? ""}`}>
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-0.5 truncate text-xs text-muted">{subtitle}</p>}
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}
