import { useEffect, useState } from "react";
import { Mark } from "./Mark";

/** The top bar. It belongs to the top of the page: once the reader scrolls down it slides away. */
export function Header() {
  const [top, setTop] = useState(true);
  useEffect(() => {
    const on = () => setTop(window.scrollY < 40);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header
      aria-hidden={!top}
      className={`fixed inset-x-0 top-0 z-30 transition duration-500 ease-out motion-reduce:transition-none ${
        top ? "" : "pointer-events-none -translate-y-full opacity-0"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <a href="/" tabIndex={top ? 0 : -1} className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
          <Mark className="h-7 w-7" />
          tonalli
        </a>
        <a href="/#team" tabIndex={top ? 0 : -1} className="link text-sm font-semibold">
          About us
        </a>
      </div>
    </header>
  );
}
