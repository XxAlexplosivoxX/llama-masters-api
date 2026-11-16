import { ArrowUpRight } from "lucide-react";
import { Rise, Scene, useNarrow } from "./Scene";

// The people behind Tonalli, each with their public LinkedIn profile.
const TEAM = [
  { name: "Eduardo Guerra", url: "https://www.linkedin.com/in/eduardoguerra1js/" },
  {
    name: "Emiliano Jacobo",
    url: "https://www.linkedin.com/in/josu%C3%A9-emiliano-vald%C3%A9s-jacobo-102413344",
  },
  { name: "Jefersson Vásquez", url: "https://www.linkedin.com/in/jefersson-v%C3%A1squezz/" },
  { name: "Alexander Olmedo", url: "https://www.linkedin.com/in/alexander-olmedo-a24249391/" },
  { name: "Josué Alemán", url: "https://www.linkedin.com/in/josue-aleman/" },
  { name: "César Flores", url: "https://linkedin.com/in/esauflores" },
];

export function Team() {
  const narrow = useNarrow();
  return (
    <Scene
      id="team"
      stage={
        narrow
          ? { center: null, x: 0.5, y: 0.1, scale: 0.42, dim: 0.2 }
          : { center: null, x: 0.82, y: 0.5, scale: 0.36, dim: 0.7 }
      }
    >
      <div className="max-w-2xl">
        <Rise>
          <h2 className="text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">Six people. One record.</h2>
        </Rise>
        <Rise delay={0.1}>
          <p className="mt-6 text-xl text-muted">The team behind Tonalli.</p>
        </Rise>
        <ul className="m-0 mt-10 list-none border-t border-border p-0">
          {TEAM.map((person, i) => (
            <li key={person.url} className="border-b border-border">
              <Rise delay={0.15 + i * 0.05}>
                <a
                  href={person.url}
                  rel="noopener noreferrer"
                  className="group flex items-center justify-between gap-6 py-5 text-xl font-semibold transition-colors hover:text-heat-5 motion-reduce:transition-none sm:text-2xl"
                >
                  {person.name}
                  <span className="flex items-center gap-1.5 text-sm font-normal text-muted transition-colors group-hover:text-heat-5 motion-reduce:transition-none">
                    LinkedIn
                    <ArrowUpRight
                      className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none"
                      aria-hidden
                    />
                  </span>
                </a>
              </Rise>
            </li>
          ))}
        </ul>
      </div>
    </Scene>
  );
}
