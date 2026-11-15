import { MotionConfig } from "motion/react";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { Globe } from "./globe/Globe";
import { DataSources } from "./legal/DataSources";
import { Privacy } from "./legal/Privacy";
import { Terms } from "./legal/Terms";
import { Calendar } from "./scenes/Calendar";
import { Fix } from "./scenes/Fix";
import { Gap } from "./scenes/Gap";
import { Hero } from "./scenes/Hero";
import { Open } from "./scenes/Open";
import { Team } from "./scenes/Team";
import { SharedProvider, useShared } from "./state";

// Three static pages next to the landing. The build copies index.html to privacy.html, terms.html and
// data.html (the Worker has no fallback page for the landing), so a path check is all the routing.
const PAGES: Record<string, () => JSX.Element> = { "/privacy": Privacy, "/terms": Terms, "/data": DataSources };

function Stage() {
  const { stage, points } = useShared();
  return <Globe stage={stage} points={points} />;
}

function Landing() {
  return (
    <SharedProvider>
      <Stage />
      <Header />
      <main>
        <Hero />
        <Gap />
        <Fix />
        <Calendar />
        <Team />
        <Open />
      </main>
      <Footer />
    </SharedProvider>
  );
}

export function App() {
  const path = window.location.pathname.replace(/(\.html)?\/*$/, "");
  const Page = Object.hasOwn(PAGES, path) ? PAGES[path] : Landing;
  return (
    <MotionConfig reducedMotion="user">
      <Page />
    </MotionConfig>
  );
}
