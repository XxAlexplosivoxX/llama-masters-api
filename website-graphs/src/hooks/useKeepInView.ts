import { useLayoutEffect, useRef } from "react";

const MARGIN = 16; // matches max-w-[calc(100vw-2rem)] on the popovers

/** Shifts an absolutely positioned popover sideways while open so it never leaves the viewport. */
export function useKeepInView<T extends HTMLElement = HTMLDivElement>(open: boolean) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    const fit = () => {
      el.style.translate = "";
      const r = el.getBoundingClientRect(), vw = document.documentElement.clientWidth;
      const dx = r.left < MARGIN ? MARGIN - r.left : r.right > vw - MARGIN ? Math.max(MARGIN - r.left, vw - MARGIN - r.right) : 0;
      if (dx) el.style.translate = `${dx}px 0`;
    };
    fit();
    addEventListener("resize", fit);
    return () => removeEventListener("resize", fit);
  }, [open]);
  return ref;
}
