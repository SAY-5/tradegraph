import { Explorer } from './components/Explorer';
import { ExposureSection } from './components/ExposureSection';
import { FullRun } from './components/FullRun';
import { Hero } from './components/Hero';
import { OntologyMap } from './components/OntologyMap';
import { PathLab } from './components/PathLab';
import { SiteFooter } from './components/SiteFooter';
import { useReducedMotion } from './hooks/useReducedMotion';

const SECTIONS = [
  ['#ontology', 'ontology'],
  ['#explorer', 'explorer'],
  ['#exposure', 'exposure'],
  ['#paths', 'paths'],
  ['#run', 'run'],
];

export function App() {
  const reduced = useReducedMotion();

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="masthead">
        <div className="shell masthead__inner">
          <a className="wordmark" href="#top">
            trade
            <span>graph</span>
          </a>
          <nav aria-label="Sections">
            {SECTIONS.map(([href, label]) => (
              <a key={href} href={href}>{label}</a>
            ))}
          </nav>
        </div>
      </header>

      <main id="main">
        <div id="top" />
        <Hero reduced={reduced} />
        <OntologyMap />
        <Explorer reduced={reduced} />
        <ExposureSection reduced={reduced} />
        <PathLab reduced={reduced} />
        <FullRun />
      </main>

      <SiteFooter />
    </>
  );
}
