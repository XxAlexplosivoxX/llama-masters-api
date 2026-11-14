import { Flame } from "lucide-react";
import { GraphsModule } from "./GraphsModule";

export function App() {
  return (
    <div className="mx-auto flex min-h-full max-w-[1500px] flex-col gap-4 px-4 py-5 sm:px-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <Flame size={20} className="text-firefly-3" aria-hidden />
          Hot spot analytics
        </h1>
        <span className="text-sm text-muted">
          Harmonized MODIS + VIIRS monthly record ·{" "}
          <a className="link" href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noreferrer">
            Data: NASA FIRMS
          </a>
        </span>
      </header>
      <main className="min-w-0">
        <GraphsModule />
      </main>
    </div>
  );
}
