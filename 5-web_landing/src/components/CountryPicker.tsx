import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { CONTINENTS, continentOf } from "../lib/continents";
import { useShared } from "../state";

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** One shared country, grouped just like the atlas and searchable across every continent. */
export function CountryPicker() {
  const { places, place, select } = useShared();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const activeOption = useRef<HTMLButtonElement>(null);
  const id = useId();

  const groups = useMemo(
    () =>
      CONTINENTS.map((continent) => ({
        continent,
        places: (places ?? []).filter((p) => continentOf(p.id) === continent),
      })).filter((g) => g.places.length),
    [places],
  );
  const ordered = useMemo(() => groups.flatMap((g) => g.places), [groups]);
  const needle = fold(query.trim());
  const found = useMemo(
    () =>
      needle
        ? ordered.filter((p) => fold(p.label).includes(needle) || p.iso.some((code) => fold(code).includes(needle)))
        : ordered,
    [ordered, needle],
  );
  const active = found[cursor];

  // A portal escapes the scenes' transforms. Use the visible viewport, including the phone keyboard.
  useLayoutEffect(() => {
    if (!open) return;
    const positionPanel = () => {
      if (!trigger.current) return;
      const box = trigger.current.getBoundingClientRect();
      const viewport = window.visualViewport;
      const left = (viewport?.offsetLeft ?? 0) + 12;
      const top = (viewport?.offsetTop ?? 0) + 12;
      const width = Math.max(0, (viewport?.width ?? window.innerWidth) - 24);
      const height = Math.max(0, (viewport?.height ?? window.innerHeight) - 24);
      const bottom = top + height;
      const below = bottom - box.bottom - 8;
      const above = box.top - 8 - top;
      const upwards = below < 280 && above > below;
      const edge = Math.min(bottom, Math.max(top, upwards ? box.top - 8 : box.bottom + 8));
      const panelWidth = Math.min(320, width);
      setPosition({
        left: Math.min(Math.max(left, box.left), left + width - panelWidth),
        top: edge,
        width: panelWidth,
        maxHeight: Math.min(400, upwards ? edge - top : bottom - edge),
        transform: upwards ? "translateY(-100%)" : undefined,
      });
    };
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && panel.current?.contains(event.target)) return;
      positionPanel();
    };
    positionPanel();
    window.addEventListener("resize", positionPanel);
    window.addEventListener("scroll", onScroll, true);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", positionPanel);
    viewport?.addEventListener("scroll", positionPanel);
    const observer = new ResizeObserver(positionPanel);
    if (trigger.current) observer.observe(trigger.current);
    return () => {
      window.removeEventListener("resize", positionPanel);
      window.removeEventListener("scroll", onScroll, true);
      viewport?.removeEventListener("resize", positionPanel);
      viewport?.removeEventListener("scroll", positionPanel);
      observer.disconnect();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    input.current?.focus({ preventScroll: true });
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node) && !panel.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  // Scroll only the options, so opening or using the arrows never moves the landing page.
  useLayoutEffect(() => {
    if (!open || !list.current || !activeOption.current) return;
    const viewport = list.current.getBoundingClientRect();
    const option = activeOption.current.getBoundingClientRect();
    if (option.top < viewport.top) list.current.scrollTop -= viewport.top - option.top;
    else if (option.bottom > viewport.bottom) list.current.scrollTop += option.bottom - viewport.bottom;
  }, [open, active, position]);

  if (!places || !place) return null;

  const show = () => {
    setQuery("");
    setCursor(
      Math.max(
        0,
        ordered.findIndex((p) => p.id === place.id),
      ),
    );
    setPosition(null);
    setOpen(true);
  };
  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  };
  const choose = (placeId: string) => {
    select(placeId);
    close();
  };
  const keys = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Tab") {
      setOpen(false);
      return;
    }
    if (e.key === "Escape") close();
    else if (e.key === "ArrowDown") setCursor((c) => Math.min(Math.max(0, found.length - 1), c + 1));
    else if (e.key === "ArrowUp") setCursor((c) => Math.max(0, c - 1));
    else if (e.key === "Home") setCursor(0);
    else if (e.key === "End") setCursor(Math.max(0, found.length - 1));
    else if (e.key === "Enter" && active) choose(active.id);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  const option = (p: (typeof found)[number]) => (
    <button
      key={p.id}
      ref={p.id === active?.id ? activeOption : undefined}
      type="button"
      id={id + "-" + p.id}
      role="option"
      tabIndex={-1}
      aria-selected={p.id === place.id}
      onPointerMove={(e) => {
        if (e.pointerType !== "touch") setCursor(found.indexOf(p));
      }}
      onClick={() => choose(p.id)}
      className={[
        "flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3.5 py-2.5 text-left text-sm",
        p.id === active?.id ? "bg-surface-2 text-text" : "text-muted",
        p.id === place.id ? "font-semibold text-text" : "",
      ].join(" ")}
    >
      <span className="min-w-0">{p.label}</span>
      {p.id === place.id && <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden />}
    </button>
  );

  return (
    <div
      ref={root}
      className="relative inline-block max-w-full text-left"
      onBlur={(e) => {
        if (!root.current?.contains(e.relatedTarget) && !panel.current?.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            show();
          } else if (e.key === "Escape" && open) {
            e.preventDefault();
            close();
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        className="group inline-flex min-h-11 max-w-full items-center gap-3 rounded-xl border border-border bg-surface/80 px-4 py-2.5 text-base font-semibold backdrop-blur transition-colors hover:border-muted motion-reduce:transition-none"
      >
        <span className="max-w-48 truncate">{place.label}</span>
        <ChevronDown
          className={
            "h-4 w-4 shrink-0 text-muted transition-transform motion-reduce:transition-none " +
            (open ? "rotate-180" : "")
          }
          aria-hidden
        />
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            style={position ?? { visibility: "hidden" }}
            className="fixed z-50 flex max-h-[calc(100dvh-1.5rem)] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-surface text-left shadow-2xl shadow-black/60"
          >
            <label className="flex min-h-12 shrink-0 items-center gap-2.5 border-b border-border px-4 focus-within:border-accent">
              <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden />
              <span className="sr-only">Search a country</span>
              <input
                ref={input}
                type="search"
                autoComplete="off"
                spellCheck={false}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCursor(0);
                }}
                onKeyDown={keys}
                placeholder="Search a country"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded
                aria-controls={id}
                aria-activedescendant={active ? id + "-" + active.id : undefined}
                className="min-h-11 w-full min-w-0 bg-transparent text-base text-text outline-none placeholder:text-muted"
              />
            </label>
            <div
              ref={list}
              id={id}
              role="listbox"
              aria-label="Countries"
              className="min-h-0 overflow-y-auto overscroll-contain p-1.5"
            >
              {needle
                ? found.map(option)
                : groups.map((g) => (
                    <div key={g.continent} role="group" aria-label={g.continent}>
                      <p className="m-0 px-3.5 pb-1 pt-3 text-xs font-semibold text-muted" aria-hidden>
                        {g.continent}
                      </p>
                      {g.places.map(option)}
                    </div>
                  ))}
            </div>
            {found.length === 0 && (
              <p role="status" className="m-0 px-5 pb-4 pt-2 text-sm text-muted">
                No country by that name.
              </p>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
