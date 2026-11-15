import { Mark } from "./Mark";

export function Footer() {
  return (
    <footer className="relative z-10 border-t border-border/60 bg-bg">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 text-sm text-muted sm:px-8 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2.5">
          <Mark className="h-5 w-5" />
          <span>
            <span className="font-semibold text-text">tonalli</span>. In Nahuatl, the warmth of the sun.
          </span>
        </div>
        <nav aria-label="Legal" className="flex flex-wrap gap-x-6 gap-y-2">
          <a className="link" href="/privacy">
            Privacy
          </a>
          <a className="link" href="/terms">
            Terms
          </a>
          <a className="link" href="/data">
            Data sources
          </a>
          <a className="link" href="/#team">
            About us
          </a>
        </nav>
      </div>
      <p className="mx-auto max-w-6xl px-5 pb-10 text-xs text-muted sm:px-8">
        Built with NASA FIRMS data. Not affiliated with or endorsed by NASA.
      </p>
    </footer>
  );
}
