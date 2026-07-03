import { registerPlugin } from '@capacitor/core';

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
 *   await TrailerPlayer.openTrailer({ youtubeKey, title?, nextYoutubeKey?, nextTitle? })
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
const TrailerPlayer = registerPlugin('TrailerPlayer', {
  web: {
    openTrailer: async ({ youtubeKey } = {}) => {
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
