import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

/** Tweens from the previous value to the new one, so a change reads as a change. */
export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const node = useRef<HTMLSpanElement>(null);
  const previous = useRef(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (reduced || !node.current) {
      if (node.current) node.current.textContent = format(value);
      return;
    }
    const controls = animate(from, value, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => { if (node.current) node.current.textContent = format(Math.round(v)); },
    });
    return () => controls.stop();
  }, [value]);

  return <span ref={node} className="num">{format(value)}</span>;
}
