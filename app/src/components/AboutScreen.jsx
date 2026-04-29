/**
 * About / Settings screen — version, attribution, links, debug toggles (later).
 *
 * Two important compliance pieces live here:
 *   - TMDB attribution (required by their API ToS)
 *   - Privacy posture statement (echoes the hosted policy)
 */
import { Capacitor } from '@capacitor/core';

const VERSION = '1.8.0';

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
        <p className="tagline">A guided tour of pre-2010 cinema, one trailer at a time.</p>
        <p className="version">v{VERSION} · {platform}</p>
      </section>

      <section className="about-section">
        <h3>Your data</h3>
        <p>
          Everything in Trailer Roulette stays on your phone. No accounts. No
          tracking. No analytics on you.
        </p>
        <p>
          {/* TODO replace with the Vercel/Pages URL after deploy */}
          <a href={import.meta.env.VITE_PRIVACY_POLICY_URL || '#'} target="_blank" rel="noreferrer">
            Privacy policy →
          </a>
        </p>
      </section>

      <section className="about-section">
        <h3>Attribution</h3>
        <p>
          Movie metadata from <a href="https://www.themoviedb.org/" target="_blank" rel="noreferrer">TMDB</a>.
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </p>
        <p>
          Trailers play via YouTube&apos;s official embedded player. Trailer Roulette
          does not host, modify, or redistribute trailer content.
        </p>
      </section>

      <section className="about-section">
        <h3>Contact</h3>
        <p>
          <a href="mailto:crescicharles@gmail.com">crescicharles@gmail.com</a>
        </p>
      </section>
    </div>
  );
}
