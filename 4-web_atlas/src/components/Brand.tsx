/** Tonalli's sun mark, the same one as the landing page (5-web_landing). */
export function TonalliMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 128 128" className={className} aria-hidden>
      <rect width="128" height="128" fill="#0B0F19" />
      <g fill="#ED5E5E">
        <rect x="72" y="12" width="8" height="16" />
        <rect x="72" y="16" width="8" height="12" transform="rotate(-45 76 64)" />
        <rect x="24" y="60" width="16" height="8" />
        <rect x="72" y="16" width="8" height="12" transform="rotate(-135 76 64)" />
        <rect x="72" y="100" width="8" height="16" />
      </g>
      <path
        fill="#F3845A"
        fillRule="evenodd"
        d="M76 36a28 28 0 1 1 0 56a28 28 0 1 1 0-56Z M76 44a20 20 0 0 1 0 40Z"
      />
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

/** Same host as the atlas: `/` is the landing on tonalli.earth and on a local dev server. */
const LANDING = (import.meta.env.VITE_LANDING_URL as string | undefined) ?? "/";

/** Top-left name; links back to the landing page. */
export function BrandLink() {
  return (
    <a
      href={LANDING}
      data-tour="brand"
      className="seg min-h-[46px] shrink-0 items-center gap-2 !px-3 hover:text-text max-sm:w-[46px] max-sm:justify-center max-sm:!px-0"
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
