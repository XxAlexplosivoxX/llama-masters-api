import { useEffect, useRef, useState } from "react";

/** Measured content-box width of the returned ref's element, in px (0 until observed). */
export function useWidth<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}
