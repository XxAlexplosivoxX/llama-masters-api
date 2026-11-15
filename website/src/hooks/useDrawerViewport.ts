import { useCallback, useEffect, useRef, useState } from "react";

export function useDrawerViewport(desktop: boolean, snap: number | string | null) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(() => window.innerHeight * 0.55);
  const frame = useRef(0);
  const until = useRef(0);
  const track = useCallback(() => {
    until.current = performance.now() + 650;
    if (frame.current) return;
    const measure = () => {
      if (ref.current) {
        const next = Math.max(0, window.innerHeight - ref.current.getBoundingClientRect().top);
        setHeight((old) => Math.abs(old - next) > 0.5 ? next : old);
      }
      frame.current = performance.now() < until.current ? requestAnimationFrame(measure) : 0;
    };
    frame.current = requestAnimationFrame(measure);
  }, []);
  useEffect(() => {
    if (desktop) return;
    track();
    const observer = new ResizeObserver(track);
    if (ref.current) observer.observe(ref.current);
    window.addEventListener("resize", track);
    window.visualViewport?.addEventListener("resize", track);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", track);
      window.visualViewport?.removeEventListener("resize", track);
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [desktop, snap, track]);
  return { ref, height, track };
}
