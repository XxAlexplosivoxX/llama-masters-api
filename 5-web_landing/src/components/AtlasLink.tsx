import { ArrowRight } from "lucide-react";

// The tool itself, served next to this page. VITE_ATLAS_URL points a local dev server at the deployed one.
export const ATLAS = (import.meta.env.VITE_ATLAS_URL as string | undefined) ?? "/atlas/";

/** The page's primary action, shared by every scene that opens the atlas. */
export function AtlasLink({ size = "lg", label = "Open the atlas" }: { size?: "sm" | "lg"; label?: string }) {
  return (
    <a
      href={ATLAS}
      rel="noopener noreferrer"
      className={`atlas-link ${size === "lg" ? "px-7 py-4 text-lg" : "px-4 py-2 text-sm"}`}
    >
      {label}
      <ArrowRight className={size === "lg" ? "h-5 w-5" : "h-4 w-4"} aria-hidden />
    </a>
  );
}
