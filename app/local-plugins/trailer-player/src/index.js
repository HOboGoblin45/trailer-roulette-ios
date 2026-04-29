import { registerPlugin } from '@capacitor/core';

/**
 * TrailerPlayer — local Capacitor plugin that opens YouTube trailers in
 * SFSafariViewController on iOS. Real Safari context, so YouTube plays
 * normally without the WKWebView Referer-stripping issue (WebKit Bug 169846).
 *
 * Web/dev fallback: opens the watch URL in a new tab. Auto-resolved.
 *
 * API:
 *   await TrailerPlayer.openTrailer({ youtubeKey: 'dQw4w9WgXcQ' })
 *     → { dismissed: true, reason: 'user' | 'replaced' | ... }
 *
 *   await TrailerPlayer.closeTrailer()
 *     → { closed: true }
 */
const TrailerPlayer = registerPlugin('TrailerPlayer', {
  web: {
    openTrailer: async ({ youtubeKey } = {}) => {
      if (typeof window === 'undefined' || !youtubeKey) {
        return { dismissed: true, reason: 'no-window' };
      }
      window.open(`https://www.youtube.com/watch?v=${encodeURIComponent(youtubeKey)}`, '_blank', 'noopener,noreferrer');
      return { dismissed: true, reason: 'web-fallback' };
    },
    closeTrailer: async () => ({ closed: false, reason: 'web-fallback' }),
  },
});

export default TrailerPlayer;
