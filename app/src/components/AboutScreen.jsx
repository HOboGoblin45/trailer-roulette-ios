/**
 * About — version, privacy posture, and the required attributions.
 *
 * Kept minimal to match the two-button app. The TMDB attribution is required
 * by their API terms; the YouTube note documents the embedded-player posture.
 *
 * The parent keeps this mounted and flips `open`, so the panel can play its
 * own exit (.screen.is-closing) instead of vanishing on the frame the back
 * button is tapped — see lib/useDismissAnimation.js.
 */
import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useDismissAnimation } from '../lib/useDismissAnimation.js';
import { getErrorLog } from '../lib/errorLog.js';

// vite.config.js injects VITE_APP_VERSION from package.json at build time;
// the neutral fallback only applies in non-Vite contexts (e.g. unit tests) —
// never hardcode a real version here, it goes stale.
const VERSION = import.meta.env.VITE_APP_VERSION || 'dev';

const DIAGNOSTIC_LINES = 3;

/** "2026-08-15T09:41:07.000Z" → "15 Aug 09:41", or '' if it will not parse. */
function shortTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default function AboutScreen({ open = true, onClose }) {
  const platform = Capacitor.getPlatform();
  const { mounted, closing, close } = useDismissAnimation(open, onClose);
  // errorLog.js has always claimed it is "surfaced read-only in the About
  // screen"; until now it was written and never read anywhere. Only shown when
  // there is something to show, so a healthy app never mentions it.
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    if (!mounted) return undefined;
    let cancelled = false;
    getErrorLog()
      .then((log) => {
        if (!cancelled && Array.isArray(log)) setRecent(log.slice(0, DIAGNOSTIC_LINES));
      })
      .catch(() => { /* diagnostics are best-effort */ });
    return () => { cancelled = true; };
  }, [mounted]);

  if (!mounted) return null;

  return (
    <div className={`screen about-screen${closing ? ' is-closing' : ''}`}>
      <header className="screen-header">
        <button className="back-btn" onClick={close} aria-label="Back">◂</button>
        <h1>About</h1>
        <span />
      </header>

      <section className="about-section">
        <h2>Trailer Roulette</h2>
        <p className="tagline">Random movie trailers from every era of cinema.</p>
        <p className="version">v{VERSION} · {platform}</p>
        {/* P0 diagnostic (handoff §7): the v3.4.1 bridge fix only matters if
            the native plugins are actually registered. Both lines must read
            "active" on a real device; "MISSING" means the Capacitor bridge
            did not bind the plugin and playback falls back to web behaviour. */}
        <p className="version">
          Native player: {Capacitor.isPluginAvailable('TrailerPlayer') ? 'active' : 'MISSING'}
          · AirPlay: {Capacitor.isPluginAvailable('AirplayPlugin') ? 'active' : 'MISSING'}
        </p>
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

      {recent.length > 0 && (
        <section className="about-section">
          <h3>Diagnostics</h3>
          <p className="version">
            The last {recent.length === 1 ? 'problem' : recent.length} the app ran into.
            Kept on this device only — include it if you email us.
          </p>
          {recent.map((e, i) => (
            <p className="version" key={`${e.t}-${i}`}>
              {shortTime(e.t)} · {e.kind} · {e.message}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}
