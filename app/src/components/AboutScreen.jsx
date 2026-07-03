/**
 * About — version, privacy posture, and the required attributions.
 *
 * Kept minimal to match the two-button app. The TMDB attribution is required
 * by their API terms; the YouTube note documents the embedded-player posture.
 */
import { Capacitor } from '@capacitor/core';

// vite.config.js injects VITE_APP_VERSION from package.json at build time;
// the neutral fallback only applies in non-Vite contexts (e.g. unit tests) —
// never hardcode a real version here, it goes stale.
const VERSION = import.meta.env.VITE_APP_VERSION || 'dev';

export default function AboutScreen({ onClose }) {
  const platform = Capacitor.getPlatform();

  return (
    <div className="screen about-screen">
      <header className="screen-header">
        <button className="back-btn" onClick={onClose} aria-label="Back">◂</button>
        <h1>About</h1>
        <span />
      </header>

      <section className="about-section">
        <h2>Trailer Roulette</h2>
        <p className="tagline">Random movie trailers from every era of cinema.</p>
        <p className="version">v{VERSION} · {platform}</p>
      </section>

      <section className="about-section">
        <h3>Your data</h3>
        <p>
          Trailer Roulette has no accounts and no tracking. Nothing about you
          leaves your device.
        </p>
        <p>
          <a href={import.meta.env.VITE_PRIVACY_POLICY_URL || '#'} target="_blank" rel="noreferrer">
            Privacy policy →
          </a>
        </p>
      </section>

      <section className="about-section">
        <h3>Attribution</h3>
        <p>
          Movie data from <a href="https://www.themoviedb.org/" target="_blank" rel="noreferrer">TMDB</a>.
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </p>
        <p>
          Trailers play via YouTube&apos;s official embedded player. Trailer Roulette
          does not host, modify, or redistribute trailer content.
        </p>
      </section>

      <section className="about-section">
        <h3>Contact</h3>
        <p><a href="mailto:crescicharles@gmail.com">crescicharles@gmail.com</a></p>
      </section>
    </div>
  );
}
