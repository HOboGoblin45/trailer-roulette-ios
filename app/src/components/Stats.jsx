import { useEffect, useState } from 'react';
import { loadProfile, READY_THRESHOLD } from '../lib/tasteProfile.js';
import { MOVIE_GENRES } from '../lib/tmdb.js';
import { get, KEYS } from '../lib/storage.js';

/**
 * "Your Taste" screen — visualizes the on-device taste profile the app builds
 * from your swipes. Full-screen overlay, same shell as Watchlist/About.
 *
 * Everything is local: profile buckets (genre/decade/runtime) + the watchlist.
 * No network, no analytics. Until READY_THRESHOLD reactions, the profile is
 * still warming up, so we nudge the user to keep swiping.
 */

// Palette (matches the app's dark theme; .screen already paints var(--bg)).
const COLORS = {
  text: 'var(--fg)',
  textDim: 'var(--fg-2)',
  gold: 'var(--gold)',
  surface: 'var(--bg-2)',
  radius: 14,
};

const RUNTIME_LABELS = {
  short: 'Short (under 90m)',
  standard: 'Standard (90–120m)',
  long: 'Long (2–2.5h)',
  epic: 'Epic (2.5h+)',
};

// Sort bucket entries by totalScore desc, keep only positive affinities, take N.
function topBuckets(bucket = {}, limit) {
  return Object.entries(bucket)
    .filter(([, slot]) => slot && slot.totalScore > 0)
    .sort((a, b) => b[1].totalScore - a[1].totalScore)
    .slice(0, limit);
}

function Pill({ children }) {
  return (
    <span
      style={{
        display: 'inline-block',
        background: COLORS.surface,
        color: COLORS.gold,
        borderRadius: 999,
        padding: '6px 14px',
        fontSize: 14,
        fontWeight: 600,
        lineHeight: 1.2,
      }}
    >
      {children}
    </span>
  );
}

function SectionTitle({ children }) {
  return (
    <h2
      style={{
        color: COLORS.text,
        fontSize: 15,
        fontWeight: 700,
        letterSpacing: 0.3,
        textTransform: 'uppercase',
        margin: '0 0 12px',
      }}
    >
      {children}
    </h2>
  );
}

export default function Stats({ onClose }) {
  const [profile, setProfile] = useState(null);
  const [watchlist, setWatchlist] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [p, list] = await Promise.all([
        loadProfile(),
        get(KEYS.WATCHLIST),
      ]);
      if (cancelled) return;
      setProfile(p);
      setWatchlist(Array.isArray(list) ? list : []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Initial/empty state: render the shell so the back button always works.
  const p = profile || { genre: {}, decade: {}, runtime: {}, totalReactions: 0 };

  const totalSwipes = p.totalReactions || 0;
  const personalizing = totalSwipes >= READY_THRESHOLD;
  const watchlistCount = watchlist.length;

  const topGenres = topBuckets(p.genre, 5)
    .map(([id]) => MOVIE_GENRES[id])
    .filter(Boolean);

  const topDecades = topBuckets(p.decade, 4).map(([decade]) => `${decade}s`);

  const runtimeWinner = topBuckets(p.runtime, 1)[0];
  const favoriteRuntime = runtimeWinner ? RUNTIME_LABELS[runtimeWinner[0]] : null;

  return (
    <div className="screen stats-screen">
      <header className="screen-header">
        <button className="back-btn" onClick={onClose} aria-label="Back">
          ◂
        </button>
        <h1>Your Taste</h1>
        <span />
      </header>

      <div style={{ padding: '8px 20px 32px', color: COLORS.text }}>
        {/* Summary row */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
          <div
            style={{
              flex: 1,
              background: COLORS.surface,
              borderRadius: COLORS.radius,
              padding: '18px 16px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 34, fontWeight: 800, color: COLORS.text, lineHeight: 1 }}>
              {totalSwipes}
            </div>
            <div style={{ fontSize: 13, color: COLORS.textDim, marginTop: 6 }}>
              trailers rated
            </div>
          </div>
          <div
            style={{
              flex: 1,
              background: COLORS.surface,
              borderRadius: COLORS.radius,
              padding: '18px 16px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 34, fontWeight: 800, color: COLORS.text, lineHeight: 1 }}>
              {watchlistCount}
            </div>
            <div style={{ fontSize: 13, color: COLORS.textDim, marginTop: 6 }}>saved</div>
          </div>
        </div>

        {/* Warming-up note */}
        {!personalizing && (
          <div
            style={{
              background: 'var(--bg-2)',
              border: `1px solid ${COLORS.gold}`,
              borderRadius: COLORS.radius,
              padding: '12px 16px',
              marginBottom: 24,
              color: COLORS.gold,
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Keep swiping to personalize — {totalSwipes}/{READY_THRESHOLD}
          </div>
        )}

        {/* Top genres */}
        <section style={{ marginBottom: 24 }}>
          <SectionTitle>Top genres</SectionTitle>
          {topGenres.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {topGenres.map((name) => (
                <Pill key={name}>{name}</Pill>
              ))}
            </div>
          ) : (
            <p style={{ color: COLORS.textDim, fontSize: 14, margin: 0 }}>
              No favorites yet — swipe right on trailers you like.
            </p>
          )}
        </section>

        {/* Favorite decades (omitted entirely when empty) */}
        {topDecades.length > 0 && (
          <section style={{ marginBottom: 24 }}>
            <SectionTitle>Favorite decades</SectionTitle>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {topDecades.map((d) => (
                <Pill key={d}>{d}</Pill>
              ))}
            </div>
          </section>
        )}

        {/* Preferred length */}
        {favoriteRuntime && (
          <section>
            <SectionTitle>Preferred length</SectionTitle>
            <p style={{ color: COLORS.text, fontSize: 16, fontWeight: 600, margin: 0 }}>
              {favoriteRuntime}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
