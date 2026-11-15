import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import type { Stage } from "../globe/draw";
import { useShared } from "../state";

/** True on narrow screens, where the globe sits behind the text instead of beside it. */
export function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.innerWidth < 900);
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < 900);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return narrow;
}

/** One screen of the page. While it crosses the middle of the viewport it holds the globe. */
export function Scene({
  id,
  stage,
  children,
  className = "",
}: {
  id?: string;
  stage: Stage;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { margin: "-50% 0px -50% 0px" });
  const { setStage } = useShared();
  const key = JSON.stringify(stage);
  useEffect(() => {
    if (inView) setStage(JSON.parse(key) as Stage);
  }, [inView, key, setStage]);
  return (
    <section
      ref={ref}
      id={id}
      className={`relative z-10 flex min-h-screen scroll-mt-16 items-center py-24 has-[button[aria-expanded=true]]:z-20 sm:py-32 ${className}`}
    >
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">{children}</div>
    </section>
  );
}

/** Text that rises into place the first time it is seen. */
export function Rise({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const still = useReducedMotion();
  if (still) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
