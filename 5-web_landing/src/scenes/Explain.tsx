import { motion, useReducedMotion } from "motion/react";
import { ATLAS } from "../components/AtlasLink";
import { Rise } from "./Scene";

/** A short line that draws in once. It stays a plain rule when motion is reduced. */
function Rule() {
  const still = useReducedMotion();
  if (still) return <span className="mt-5 block h-px w-12 bg-heat-4" aria-hidden />;
  return (
    <motion.span
      className="mt-5 block h-px w-12 origin-left bg-heat-4"
      aria-hidden
      initial={{ scaleX: 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={{ once: true, amount: 0.8 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    />
  );
}

/** Two short answers, just after the hero. Not a full screen: the globe stays with the scenes around it. */
export function Explain() {
  return (
    <section id="how" className="relative z-10 scroll-mt-16 border-y border-border/60 bg-bg py-16 sm:py-24">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:gap-20">
        <Rise>
          <h2 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">What it does</h2>
          <Rule />
          <p className="mt-5 text-lg text-muted">
            Tonalli is a calendar of satellite hotspots for any country. It shows the months that usually have the most
            hotspots, the years that stand out, and how the latest month compares with its usual level.
          </p>
          <p className="mt-4 text-lg text-muted">
            <a href={ATLAS} rel="noopener noreferrer" className="link">
              The atlas
            </a>{" "}
            lets you draw an area, play the months, and download the counts.
          </p>
        </Rise>
        <Rise delay={0.12}>
          <h2 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">How it works</h2>
          <Rule />
          <p className="mt-5 text-lg text-muted">
            MODIS sees heat in 1 km pixels. VIIRS, its successor, sees 375 m and reports more hotspots for the same
            heat. Tonalli keeps one scale: VIIRS where a satellite observed the month, and earlier months rebuilt from
            MODIS. The two sensors are never added together.
          </p>
          <p className="mt-4 text-lg text-muted">
            A hotspot is one satellite pixel. It is not a count of separate events, and it is not burned area. Months
            before 2012 are an estimate, with a range rather than one exact number.
          </p>
        </Rise>
      </div>
    </section>
  );
}
