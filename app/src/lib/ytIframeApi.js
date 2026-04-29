/**
 * YouTube IFrame Player API loader.
 *
 * Loads https://www.youtube.com/iframe_api exactly once per session and
 * resolves with the global `YT` namespace. The API itself defines a global
 * callback `onYouTubeIframeAPIReady`, which we hook into here.
 *
 * Why not a polyfilled iframe + postMessage protocol? Two reasons:
 *   1. The official API surface (loadVideoById, getDuration, PlayerState
 *      enum) is meaningfully ergonomic.
 *   2. YouTube's own embedded player auto-loads it anyway, so the bytes
 *      cost is effectively zero.
 *
 * Network failure is non-fatal — the calling component falls back to a
 * static iframe.
 */

let promise = null;

export function loadYouTubeIframeAPI() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('No window'));
  }
  if (window.YT && window.YT.Player) {
    return Promise.resolve(window.YT);
  }
  if (promise) return promise;

  promise = new Promise((resolve, reject) => {
    // Stash any pre-existing handler so we don't blow away another loader.
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      try { previous?.(); } catch { /* noop */ }
      resolve(window.YT);
    };

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      promise = null; // allow retry
      reject(new Error('Failed to load YouTube IFrame API'));
    };
    document.head.appendChild(script);
  });

  return promise;
}

/** YT.PlayerState constants — re-exported for callers that don't want to depend on `window.YT`. */
export const PlayerState = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
};
