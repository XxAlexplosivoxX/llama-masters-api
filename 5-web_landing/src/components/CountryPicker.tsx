import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { useShared } from "../state";

/** The country on show: a search box over the list, in the page's own colours. It changes three scenes at once. */
export function CountryPicker() {
  const { places, place, select } = useShared();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();

  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!places) return [];
    if (!q) return places;
    return places.filter((p) => p.label.toLowerCase().includes(q) || p.iso.some((c) => c.toLowerCase() === q));
  }, [places, query]);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  // Keep the highlighted row in sight while the arrows move it.
  useEffect(() => {
    list.current?.children[cursor]?.scrollIntoView({ block: "nearest" });
  }, [cursor, open]);

  if (!places || !place) return null;

  const show = () => {
    setQuery("");
    setCursor(Math.max(0, places.indexOf(place)));
    setOpen(true);
  };
  const choose = (placeId: string) => {
    select(placeId);
    setOpen(false);
  };
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown") setCursor((c) => Math.min(found.length - 1, c + 1));
    else if (e.key === "ArrowUp") setCursor((c) => Math.max(0, c - 1));
    else if (e.key === "Enter" && found[cursor]) choose(found[cursor].id);
    else return;
    e.preventDefault();
  };

  return (
    <div ref={root} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : show())}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        className="group inline-flex items-center gap-3 rounded-full border border-border bg-surface/80 py-2.5 pl-5 pr-4 text-base font-semibold backdrop-blur transition-colors hover:border-heat-4"
      >
        <span className="h-2 w-2 rounded-full bg-heat-4" aria-hidden />
        <span className="max-w-48 truncate">{place.label}</span>
        <ChevronDown
          className={`h-4 w-4 text-muted transition-transform group-hover:text-heat-5 ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open && (
        <div className="absolute left-0 z-40 mt-2 w-72 max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/60">
          <label className="flex items-center gap-2.5 border-b border-border px-4 py-3">
            <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            <span className="sr-only">Search a country</span>
            <input
              ref={input}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCursor(0);
              }}
              onKeyDown={keys}
              placeholder="Search a country"
              role="combobox"
              aria-expanded
              aria-controls={id}
              aria-activedescendant={found[cursor] ? `${id}-${found[cursor].id}` : undefined}
              className="w-full bg-transparent text-base text-text outline-none placeholder:text-muted"
            />
          </label>
          <ul ref={list} id={id} role="listbox" className="m-0 max-h-64 list-none overflow-y-auto p-1.5">
            {found.map((p, i) => (
              <li
                key={p.id}
                id={`${id}-${p.id}`}
                role="option"
                aria-selected={p.id === place.id}
                onPointerMove={() => setCursor(i)}
                onClick={() => choose(p.id)}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3.5 py-2 text-sm ${
                  i === cursor ? "bg-surface-2 text-text" : "text-muted"
                } ${p.id === place.id ? "font-semibold text-heat-5" : ""}`}
              >
                <span className="truncate">{p.label}</span>
                {p.id === place.id && <Check className="h-4 w-4 shrink-0" aria-hidden />}
              </li>
            ))}
            {found.length === 0 && <li className="px-3.5 py-3 text-sm text-muted">No country by that name.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
