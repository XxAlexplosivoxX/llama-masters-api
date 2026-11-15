import { CircleQuestionMark } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TourSide, TourStep } from "./steps";

type Box = { left: number; top: number; width: number; height: number };

const PAD = 6;
const MARGIN = 12;
const GAP = 14;
const CARD_WIDTH = 320;
const MISSING_MS = 1500;
const EASE = "cubic-bezier(.22,1,.36,1)";

function scrollParent(el: Element): HTMLElement | null {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if ((overflowY === "auto" || overflowY === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

/** Brings the target into its scroll container, vertically only (scrollIntoView can shift clipped parents sideways). */
function revealIn(el: Element, parent: HTMLElement) {
  const r = el.getBoundingClientRect();
  const p = parent.getBoundingClientRect();
  if (r.top >= p.top + 8 && r.bottom <= p.bottom - 8) return;
  const delta = r.height > p.height - 32 ? r.top - p.top - 16 : r.top - p.top - (p.height - r.height) / 2;
  parent.scrollTop += delta;
}

function clippedRect(el: Element, parent: HTMLElement | null): Box | null {
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  let left = r.left - PAD;
  let top = r.top - PAD;
  let right = r.right + PAD;
  let bottom = r.bottom + PAD;
  const clips = [{ left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }];
  if (parent) clips.push(parent.getBoundingClientRect());
  for (const c of clips) {
    left = Math.max(left, c.left);
    top = Math.max(top, c.top);
    right = Math.min(right, c.right);
    bottom = Math.min(bottom, c.bottom);
  }
  if (right - left < 4 || bottom - top < 4) return null;
  return { left, top, width: right - left, height: bottom - top };
}

const same = (a: Box | null, b: Box | null) =>
  a === b ||
  (!!a &&
    !!b &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5);

const OPPOSITE: Record<TourSide, TourSide> = { top: "bottom", bottom: "top", left: "right", right: "left" };

function placeCard(target: Box | null, side: TourSide, w: number, h: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clamp = (v: number, max: number) => Math.max(MARGIN, Math.min(v, max - MARGIN));
  if (!target) return { left: (vw - w) / 2, top: (vh - h) / 2 };
  const at = (s: TourSide) => {
    const cx = target.left + target.width / 2 - w / 2;
    const cy = target.top + target.height / 2 - h / 2;
    if (s === "top") return { left: cx, top: target.top - GAP - h };
    if (s === "bottom") return { left: cx, top: target.top + target.height + GAP };
    if (s === "left") return { left: target.left - GAP - w, top: cy };
    return { left: target.left + target.width + GAP, top: cy };
  };
  const fits = ({ left, top }: { left: number; top: number }, s: TourSide) =>
    s === "top" || s === "bottom" ? top >= MARGIN && top + h <= vh - MARGIN : left >= MARGIN && left + w <= vw - MARGIN;
  const order: TourSide[] = [side, OPPOSITE[side], ...(["bottom", "top", "left", "right"] as TourSide[])];
  const chosen = order.find((s) => fits(at(s), s)) ?? side;
  const pos = at(chosen);
  return { left: clamp(pos.left, vw - w), top: clamp(pos.top, vh - h) };
}

export function Tour({
  open,
  steps,
  desktop,
  onStep,
  onClose,
}: {
  open: boolean;
  steps: TourStep[];
  desktop: boolean;
  onStep: (step: TourStep) => void;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  // The card keeps showing the previous step until the next target resolves, so it never sits in the wrong place.
  const [shown, setShown] = useState(0);
  const [rect, setRect] = useState<Box | null>(null);
  const [cardPos, setCardPos] = useState<{ left: number; top: number } | null>(null);
  const dir = useRef(1);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    if (open) {
      setIndex(0);
      setShown(0);
      setRect(null);
      dir.current = 1;
    }
  }, [open]);

  const step = steps[index];
  useEffect(() => {
    if (open && step) onStep(step);
  }, [open, index]);

  const go = (delta: number) => {
    const next = index + delta;
    dir.current = delta;
    if (next < 0) return;
    if (next >= steps.length) onClose();
    else setIndex(next);
  };
  const goRef = useRef(go);
  goRef.current = go;

  // Follow the target every frame: the panel opening, scrolling and resizes all move it.
  useEffect(() => {
    if (!open || !step) return;
    const started = performance.now();
    let frame = 0;
    let revealed = false;
    let last: Box | null = null;
    const tick = () => {
      if (!step.target) {
        setShown(index);
        setRect(null);
        return;
      }
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      const parent = el ? scrollParent(el) : null;
      if (el && parent && !revealed) {
        revealIn(el, parent);
        revealed = true;
      }
      const box = el ? clippedRect(el, parent) : null;
      if (box) {
        setShown(index);
        if (!same(box, last)) {
          last = box;
          setRect(box);
        }
      } else if (performance.now() - started > MISSING_MS && shown !== index) {
        goRef.current(dir.current);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [open, index, step]);

  const current = steps[shown] ?? step;
  const ready = shown === index;

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!open || !card || !current) return;
    const pos = placeCard(current.target ? rect : null, current.side ?? "bottom", card.offsetWidth, card.offsetHeight);
    setCardPos((old) => (old && Math.abs(old.left - pos.left) < 0.5 && Math.abs(old.top - pos.top) < 0.5 ? old : pos));
  });

  // Vaul can pull focus into the drawer when its snap changes; keep it on the card.
  useEffect(() => {
    if (open && !cardRef.current?.contains(document.activeElement)) nextRef.current?.focus({ preventScroll: true });
  }, [open, shown, rect]);

  // Focus: Next keeps it between steps; the previous element gets it back on close.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => nextRef.current?.focus({ preventScroll: true }));
    return () => previous?.focus?.({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Capture phase + stopPropagation: App's Esc handler would close the details panel.
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        goRef.current(e.key === "ArrowRight" ? 1 : -1);
      } else if (e.key === "Tab") {
        const card = cardRef.current;
        if (!card) return;
        const items = [...card.querySelectorAll<HTMLElement>("button:not([disabled])")];
        if (!items.length) return;
        const first = items[0];
        const lastItem = items[items.length - 1];
        const inside = card.contains(document.activeElement);
        if (!inside || (e.shiftKey && document.activeElement === first)) {
          e.preventDefault();
          (e.shiftKey ? lastItem : first).focus();
        } else if (!e.shiftKey && document.activeElement === lastItem) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open || !current) return null;

  const hole = current.target && rect ? rect : null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const isFirst = shown === 0;
  const isLast = shown === steps.length - 1;
  const transition = ["left", "top", "width", "height", "border-radius"].map((p) => `${p} 300ms ${EASE}`).join(",");

  return createPortal(
    <div
      className="fixed inset-0 z-[100] touch-none overscroll-none"
      onPointerDown={(e) => {
        if (!cardRef.current?.contains(e.target as Node)) e.preventDefault();
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none fixed"
        style={{
          left: hole ? hole.left : vw / 2,
          top: hole ? hole.top : vh / 2,
          width: hole ? hole.width : 0,
          height: hole ? hole.height : 0,
          borderRadius: hole ? 12 : 0,
          boxShadow: `0 0 0 9999px rgb(11 15 26 / .76)${hole ? ", inset 0 0 0 2px var(--color-accent)" : ""}`,
          transition,
        }}
      />
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="fixed rounded-xl border border-border bg-surface p-3.5 shadow-2xl shadow-black/40"
        style={{
          width: desktop ? CARD_WIDTH : `min(${CARD_WIDTH}px, calc(100vw - 24px))`,
          left: cardPos?.left ?? -9999,
          top: cardPos?.top ?? -9999,
          visibility: cardPos ? "visible" : "hidden",
          transition: cardPos ? `left 300ms ${EASE}, top 300ms ${EASE}` : undefined,
        }}
      >
        <div aria-live="polite">
          <h2 id={titleId} className="text-base font-semibold leading-snug">
            {current.title}
          </h2>
          <p id={bodyId} className="mt-1.5 text-sm leading-relaxed text-muted">
            {current.body}
          </p>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <span className="num text-xs text-muted">
            {shown + 1} of {steps.length}
          </span>
          {!isLast && (
            <button className="link ml-2 text-xs" onClick={onClose}>
              Skip tour
            </button>
          )}
          <span className="ms-auto" />
          {!isFirst && (
            <button className="btn !min-h-9 !px-3" onClick={() => go(-1)} disabled={!ready}>
              Back
            </button>
          )}
          <button ref={nextRef} className="btn btn-primary !min-h-9 !px-3" onClick={() => go(1)}>
            {isFirst ? "Start" : isLast ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function TourButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="seg" data-tour="tour-button">
      <button onClick={onClick} aria-label="Take the tour" title="Take the tour" className="w-10 justify-center !px-0">
        <CircleQuestionMark size={16} aria-hidden />
      </button>
    </div>
  );
}
