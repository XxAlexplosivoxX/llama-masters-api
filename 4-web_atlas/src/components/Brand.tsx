/** Tonalli's sun mark, the same one as the landing page (5-web_landing). */
export function TonalliMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="9" className="fill-heat-4" />
      <circle cx="16" cy="16" r="4.5" className="fill-heat-6" />
      {Array.from({ length: 8 }, (_, i) => (
        <line
          key={i}
          x1="16"
          y1="2"
          x2="16"
          y2="5"
          className="stroke-heat-5"
          strokeWidth="2"
          strokeLinecap="round"
          transform={`rotate(${i * 45} 16 16)`}
        />
      ))}
    </svg>
  );
}

export function BrandName() {
  return (
    <span className="whitespace-nowrap text-sm">
      <span className="font-semibold">Tonalli</span> <span className="font-bold tracking-wider">ATLAS</span>
    </span>
  );
}

/** Top-left name; links back to the landing page at the site root. */
export function BrandLink() {
  return (
    <a
      href="/"
      data-tour="brand"
      className="seg min-h-[46px] items-center gap-2 !px-3 hover:text-text max-sm:w-[46px] max-sm:justify-center max-sm:!px-0"
      aria-label="Tonalli ATLAS: back to the home page"
      title="Back to the Tonalli home page"
    >
      <TonalliMark className="h-6 w-6 shrink-0" />
      <span className="max-sm:hidden">
        <BrandName />
      </span>
    </a>
  );
}
