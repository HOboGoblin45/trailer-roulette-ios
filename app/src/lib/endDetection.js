/**
 * Robust end-of-trailer detection for YouTube embeds that serve pre-roll ads.
 *
 * The bug it fixes: YouTube's IFrame Player fires an onStateChange -> ENDED (0)
 * event when a *pre-roll ad* finishes, before the real trailer starts. Code
 * that advances on any ENDED cuts the trailer off after the ad (commonly
 * ~6-30s) -- the "trailers only play for about 15 seconds" symptom.
 *
 * We separate a real end from an ad boundary with two independent signals,
 * either of which is sufficient on its own:
 *
 *   1. Progress fast-path -- at ENDED, if we know the video's duration and the
 *      current time reached the end of a plausibly-long clip
 *      (currentTime ~= duration AND currentTime >= minContentSeconds), the
 *      video genuinely finished. Reported immediately, no delay.
 *
 *   2. Resume-confirm -- otherwise wait confirmMs. A pre-roll ad boundary
 *      resumes playback (PLAYING/BUFFERING) within ~1s, which cancels the
 *      pending end. A real end resumes nothing, so the timer fires and we
 *      report the end. This path needs no duration data at all, so it works
 *      even when only bare state numbers are available.
 *
 * The detector is pure and timer-injectable, so it unit-tests without real time
 * or a real YouTube player. The identical logic is mirrored in the native iOS
 * plugin (TrailerPlayer.swift) and the Vercel embed proxy (landing-page/api/
 * embed.js) so every playback path is protected the same way.
 */

// YT.PlayerState numerics we care about.
const ENDED = 0;
const PLAYING = 1;
const BUFFERING = 3;

export const END_DETECT_DEFAULTS = {
  confirmMs: 1200, // how long to wait for playback to resume after an ENDED
  minContentSeconds: 32, // shortest clip we'll trust the progress fast-path for
  endEpsilonSeconds: 1.5, // how close to duration counts as "reached the end"
};

/**
 * Create an ad-aware end detector.
 *
 * @param {object} opts
 * @param {(info: {reason: string, confirmedBy: string, currentTime?: number, duration?: number}) => void} opts.onEnd
 *        Called exactly once when a REAL end is confirmed.
 * @param {() => ({currentTime: number, duration: number} | null)} [opts.getProgress]
 *        Returns the player's current time/duration at ENDED, or null if unknown.
 * @param {number} [opts.confirmMs]
 * @param {number} [opts.minContentSeconds]
 * @param {number} [opts.endEpsilonSeconds]
 * @param {(fn: Function, ms: number) => *} [opts.setTimer]   Injectable setTimeout (tests).
 * @param {(handle: *) => void} [opts.clearTimer]             Injectable clearTimeout (tests).
 */
export function createEndDetector(opts = {}) {
  const {
    onEnd,
    getProgress,
    confirmMs = END_DETECT_DEFAULTS.confirmMs,
    minContentSeconds = END_DETECT_DEFAULTS.minContentSeconds,
    endEpsilonSeconds = END_DETECT_DEFAULTS.endEpsilonSeconds,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (handle) => clearTimeout(handle),
  } = opts;

  let pending = null; // confirm-timer handle, or null when idle
  let disposed = false;

  function cancel() {
    if (pending !== null) {
      clearTimer(pending);
      pending = null;
    }
  }

  function reachedEnd(p) {
    return (
      !!p &&
      Number.isFinite(p.duration) &&
      Number.isFinite(p.currentTime) &&
      p.duration > 0 &&
      p.currentTime >= p.duration - endEpsilonSeconds &&
      p.currentTime >= minContentSeconds
    );
  }

  function report(confirmedBy, p) {
    cancel();
    if (disposed) return;
    onEnd?.({ reason: 'ended', confirmedBy, ...(p || {}) });
  }

  return {
    /**
     * Feed a raw YouTube player state. Call for every onStateChange.
     * @param {number} state YT.PlayerState numeric (0=ENDED, 1=PLAYING, 3=BUFFERING, ...)
     */
    onState(state) {
      if (disposed) return;
      if (state === PLAYING || state === BUFFERING) {
        // Playback (re)started -> any pending "ended" was an ad/transition edge.
        cancel();
        return;
      }
      if (state !== ENDED) return;
      const p = getProgress ? getProgress() : null;
      if (reachedEnd(p)) {
        report('progress', p);
        return;
      }
      cancel();
      pending = setTimer(() => {
        pending = null;
        report('timeout', null);
      }, confirmMs);
    },
    /** Drop any pending confirmation (e.g. when manually loading a new video). */
    reset() {
      cancel();
    },
    /** True while waiting to confirm a candidate end. */
    isPending() {
      return pending !== null;
    },
    dispose() {
      disposed = true;
      cancel();
    },
  };
}
