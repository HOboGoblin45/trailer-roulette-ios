import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * TrailerPlayer — local Capacitor plugin for in-app YouTube trailer playback.
 *
 * On iOS (v2.0.0) it presents a fullscreen modal hosting a fresh WKWebView
 * that loads our Vercel proxy page (a real third-party https origin YouTube
 * accepts as an embedder). Playback is CONTINUOUS: the modal stays open and
 * chains to the next trailer in place — no dismiss/re-present between videos.
 *
 * Web/dev fallback: opens the watch URL in a new tab. Auto-resolved.
 *
 * API:
 *   await TrailerPlayer.openTrailer({
 *     youtubeKey,          // string   — required, the YouTube video id
 *     title?,              // string   — shown in the glass header
 *     muted?,              // boolean  — start muted
 *     nextYoutubeKey?,     // string   — primes the in-place chain target
 *     nextTitle?,          // string   — header text for that next trailer
 *     posterUrl?,          // string   — v3.2.2, see below
 *   })
 *     → { dismissed: true, reason, youtubeKey }
 *       reason ∈ 'user' | 'ended' | 'skip' | 'replaced' | 'unplayable:<...>'
 *
 *   await TrailerPlayer.enqueueNext({ youtubeKey, title? })
 *     → { queued: boolean, reason? }    // primes the in-place chain target
 *
 *   await TrailerPlayer.setMuted({ muted })
 *     → { applied: boolean, muted? }    // live mute/unmute of the open player
 *
 *   await TrailerPlayer.closeTrailer()
 *     → { closed: boolean }
 *
 * Events (addListener):
 *   'trailerEvent' → { event, youtubeKey, from?, cause? }
 *     event ∈ 'started'  (playback began)
 *           | 'advanced' (auto-chained to next trailer on end / error)
 *           | 'skipped'  (user tapped in-player Skip → chained to next)
 *     cause ∈ 'ended' | 'unplayable' | 'user' (why an advance happened)
 */

/**
 * Options for {@link TrailerPlayer.openTrailer}.
 *
 * @typedef  {Object} OpenTrailerOptions
 * @property {string}  youtubeKey        Required. YouTube video id.
 * @property {string}  [title]           Shown in the player's glass header.
 * @property {boolean} [muted]           Start muted.
 * @property {string}  [nextYoutubeKey]  Primes the in-place chain target.
 * @property {string}  [nextTitle]       Header text for that next trailer.
 * @property {string}  [posterUrl]       v3.2.2, iOS only. See below.
 *
 * posterUrl: an https URL to artwork for THIS movie — a TMDB backdrop is ideal,
 * a poster works. The native player shows it blurred and dimmed over the player
 * for the 2-3s the Vercel proxy page takes to load, so the modal dissolves onto
 * this movie's own artwork rather than onto pure black (which read as the app
 * crashing), then cross-fades it away the instant anything starts playing.
 *
 * "The instant anything starts playing" includes a pre-roll ad, on purpose: the
 * artwork covers the player, and YouTube API Services Developer Policies III.I.5
 * forbids blocking served ads. A timer drops it regardless after a few seconds.
 * Worth knowing on the JS side because it means the poster is a load-time
 * courtesy only — never assume it is still up.
 *
 * Strictly optional and non-fatal in every failure mode: omitted, empty,
 * non-https, or an unreachable URL all fall back to the plain black stage, so a
 * caller that never passes it behaves exactly as it did before v3.2.2. Pass the
 * same URL the JS stage is already showing —
 * `backdropUrl(m.backdrop_path) || posterUrl(m.poster_path)` — so the handoff
 * from the roulette stage into the player is visually continuous.
 *
 * There is deliberately no `nextPosterUrl`. After the first trailer, chaining is
 * a ~0.5s in-place swap during which the WKWebView keeps painting the previous
 * frame, so the native side retires the poster stage for the rest of the
 * session; re-showing one between trailers would be a flash, not a courtesy.
 */

/**
 * On iOS this fallback must never run. If it does, the native plugin failed to
 * register and the app has quietly stopped being the app: no modal, no chrome,
 * no end detection, no chaining — just YouTube's own watch page opened in a
 * tab, which looks enough like "a trailer playing" to hide the failure
 * completely. That is precisely what happened before v3.4.1, when the Swift
 * class had not been migrated to Capacitor 6's CAPBridgedPlugin: an entire
 * release cycle of native work was unreachable and nothing anywhere said so.
 *
 * So on iOS this now throws. A visible error with a retry is worth far more
 * than a silent degradation that costs days to spot.
 */
function assertNativeOniOS(method) {
  if (Capacitor.getPlatform() !== 'ios') return;
  const msg = `TrailerPlayer.${method} fell back to the web implementation on iOS. `
    + 'The native plugin is not registered — check that the Swift class conforms to '
    + 'CAPBridgedPlugin and declares identifier, jsName and pluginMethods.';
  console.error(`[TrailerPlayer] ${msg}`);
  throw new Error(msg);
}

const TrailerPlayer = registerPlugin('TrailerPlayer', {
  web: {
    openTrailer: async ({ youtubeKey } = {}) => {
      assertNativeOniOS('openTrailer');
      if (typeof window === 'undefined' || !youtubeKey) {
        return { dismissed: true, reason: 'no-window', youtubeKey: youtubeKey || '' };
      }
      window.open(`https://www.youtube.com/watch?v=${encodeURIComponent(youtubeKey)}`, '_blank', 'noopener,noreferrer');
      return { dismissed: true, reason: 'web-fallback', youtubeKey };
    },
    enqueueNext: async () => ({ queued: false, reason: 'web-fallback' }),
    setMuted: async () => ({ applied: false, reason: 'web-fallback' }),
    closeTrailer: async () => ({ closed: false, reason: 'web-fallback' }),
  },
});

export default TrailerPlayer;
