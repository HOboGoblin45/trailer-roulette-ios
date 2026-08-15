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
 *   2. Resume-confirm -- otherwise wait a confirm window. A pre-roll ad
 *      boundary resumes playback (PLAYING/BUFFERING) shortly after, which
 *      cancels the pending end. A real end resumes nothing, so the timer
 *      fires and we report the end. This path needs no duration data at all,
 *      so it works even when only bare state numbers are available.
 *
 * v3.2.0 -- AD-HARDENED MODE (fixes the "~13 seconds" regression class):
 * Callers that can observe playback progress feed it in via onProgress(t, d)
 * and pin the content's true duration via setPinnedDuration(d) (sampled from
 * player metadata BEFORE any ad rolls). That upgrades the detector:
 *
 *   - contentConfirmed -- true only once we've watched >= confirmProgressSeconds
 *     of forward progress on the CONTENT (duration matches the pin when one
 *     exists, else duration >= minContentSeconds). Ads can't fake this when a
 *     pin is present: their duration differs from the pinned content duration.
 *   - Dual confirm window -- before content is confirmed, the resume-confirm
 *     wait is preContentConfirmMs (5s) instead of confirmMs (1.2s). Ad pods
 *     sometimes take 2-4s between ads / before content; the short window
 *     falsely advanced in that gap. After content has confirmed, real ends
 *     still advance snappily (1.2s worst case, instant via fast-path usually).
 *   - Pinned fast-path gate -- the fast-path only fires when the reported
 *     duration matches the pinned content duration (when a pin exists) AND
 *     content was confirmed. A >= 32s unskippable ad reaching its own "end"
 *     can no longer fast-path a false advance.
 *
 * v3.2.1 -- corrections. v3.2.0 diagnosed the cause (ad variants that never
 * fire a PLAYING state) but kept relying on state events in two places:
 *
 *   - A pending end could only be cancelled by onState(PLAYING|BUFFERING). If
 *     the next ad in a pod -- or the trailer itself -- started silently, the
 *     confirm timer fired and the trailer was skipped seconds in. Forward
 *     progress fed through onProgress now cancels it too. A genuinely ended
 *     video cannot cancel anything: its currentTime stops advancing, which is
 *     what progressEpsilonSeconds tests for.
 *   - contentConfirmed accepted an unpinned clip of >= minContentSeconds, so a
 *     45s unskippable ad confirmed as "content" -- which both shortened the
 *     confirm window below a typical ad-pod gap and unlocked the fast-path at
 *     the ad's own end. Confirmation and the fast-path now both require a pin.
 *     Unpinned, a real end is reported via the long window instead: later
 *     rather than wrong.
 *
 * Backward compatible: callers that never call onProgress/setPinnedDuration
 * get exactly the v3.1.0 behavior (legacy mode).
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
  confirmMs: 1200, // resume-confirm wait once content playback has been confirmed
  preContentConfirmMs: 5000, // resume-confirm wait BEFORE content confirms (ad pods gap slowly)
  minContentSeconds: 32, // shortest clip we'll trust the progress fast-path for
  endEpsilonSeconds: 1.5, // how close to duration counts as "reached the end"
  pinEpsilonSeconds: 2.5, // how far a reported duration may drift from the pinned content duration
  confirmProgressSeconds: 3, // forward progress required to count as real content playback
  unpinnedContentSeconds: 65, // with no pin, a clip longer than this is content, not an ad
  progressEpsilonSeconds: 0.25, // a sample must advance by more than this to count as playback
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
 * @param {number} [opts.preContentConfirmMs]
 * @param {number} [opts.minContentSeconds]
 * @param {number} [opts.endEpsilonSeconds]
 * @param {number} [opts.pinEpsilonSeconds]
 * @param {number} [opts.confirmProgressSeconds]
 * @param {number} [opts.progressEpsilonSeconds]
 * @param {(fn: Function, ms: number) => *} [opts.setTimer]   Injectable setTimeout (tests).
 * @param {(handle: *) => void} [opts.clearTimer]             Injectable clearTimeout (tests).
 */
export function createEndDetector(opts = {}) {
  const {
    onEnd,
    getProgress,
    confirmMs = END_DETECT_DEFAULTS.confirmMs,
    preContentConfirmMs = END_DETECT_DEFAULTS.preContentConfirmMs,
    minContentSeconds = END_DETECT_DEFAULTS.minContentSeconds,
    endEpsilonSeconds = END_DETECT_DEFAULTS.endEpsilonSeconds,
    pinEpsilonSeconds = END_DETECT_DEFAULTS.pinEpsilonSeconds,
    confirmProgressSeconds = END_DETECT_DEFAULTS.confirmProgressSeconds,
    unpinnedContentSeconds = END_DETECT_DEFAULTS.unpinnedContentSeconds,
    progressEpsilonSeconds = END_DETECT_DEFAULTS.progressEpsilonSeconds,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (handle) => clearTimeout(handle),
  } = opts;

  let pending = null; // confirm-timer handle, or null when idle
  let disposed = false;

  // Ad-hardened mode state. `enhanced` flips true the first time a caller
  // feeds progress or pins a duration; until then behavior is exactly legacy.
  let enhanced = false;
  let pinnedDuration = 0; // 0 = no pin
  let contentConfirmed = false;
  let progressAccum = 0; // forward seconds accumulated this playback epoch
  let lastT = null; // last currentTime sample (null = no sample this epoch)
  let lastKnown = { currentTime: NaN, duration: NaN }; // freshest feed sample

  function cancel() {
    if (pending !== null) {
      clearTimer(pending);
      pending = null;
    }
  }

  /** Does duration `d` look like the pinned content (when a pin exists)? */
  function pinOk(d) {
    if (!pinnedDuration) return true;
    return Number.isFinite(d) && Math.abs(d - pinnedDuration) <= pinEpsilonSeconds;
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

  function resolveProgress() {
    const p = getProgress ? getProgress() : null;
    if (p) return p;
    if (Number.isFinite(lastKnown.currentTime) && Number.isFinite(lastKnown.duration)) {
      return { currentTime: lastKnown.currentTime, duration: lastKnown.duration };
    }
    return null;
  }

  /** Start a new playback epoch (after an ENDED boundary or a video swap). */
  function resetEpoch() {
    progressAccum = 0;
    lastT = null;
  }

  function fullReset() {
    cancel();
    resetEpoch();
    pinnedDuration = 0;
    contentConfirmed = false;
    lastKnown = { currentTime: NaN, duration: NaN };
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
      const p = resolveProgress();
      // Fast-path: playback demonstrably reached the end of a plausibly-long
      // clip. In enhanced mode we additionally require a PINNED content
      // duration that this clip matches, plus confirmed content playback.
      // v3.2.0 treated "no pin" as a match, which let a long unskippable ad
      // ending at its own duration fast-path a false advance -- the fast-path
      // only saves the confirm window, so when we cannot tell an ad's end from
      // the trailer's we wait instead.
      // Unpinned fallback: playback reached the end of a clip longer than any
      // pre-roll ad. Needed because the pin only exists once the v3.2.1+ proxy
      // is deployed, and refusing to fast-path without one stalls the app on
      // YouTube's replay screen at the end of every trailer.
      const unpinnedContent = enhanced
        && pinnedDuration <= 0
        && Number.isFinite(p?.duration)
        && p.duration >= unpinnedContentSeconds;
      const fastPathAllowed = enhanced
        ? ((pinnedDuration > 0 && contentConfirmed && pinOk(p?.duration)) || unpinnedContent)
        : true;
      if (fastPathAllowed && reachedEnd(p)) {
        report('progress', p);
        return;
      }
      cancel();
      // New epoch: whatever plays after this boundary (next ad in the pod, or
      // the real content) accumulates progress from scratch.
      resetEpoch();
      const waitMs = (!enhanced || contentConfirmed) ? confirmMs : preContentConfirmMs;
      pending = setTimer(() => {
        pending = null;
        report('timeout', null);
      }, waitMs);
    },

    /**
     * Feed a playback progress sample (currentTime/duration), e.g. from a 1s
     * poll of getCurrentTime()/getDuration() or the embed's infoDelivery
     * stream. Enables ad-hardened mode.
     * @param {number} currentTime
     * @param {number} duration
     */
    onProgress(currentTime, duration) {
      if (disposed) return;
      enhanced = true;
      if (Number.isFinite(duration) && duration > 0) lastKnown.duration = duration;
      if (!Number.isFinite(currentTime)) return;
      lastKnown.currentTime = currentTime;
      let moved = false;
      if (lastT !== null && currentTime > lastT + progressEpsilonSeconds) {
        const delta = currentTime - lastT;
        // Ignore implausible jumps (seek/swap glitches) -- we only want to
        // accumulate genuinely-watched forward playback.
        if (delta < 8) {
          progressAccum += delta;
          moved = true;
        }
      }
      lastT = currentTime;
      if (moved) {
        // Playback is demonstrably live, so any pending "ended" was an ad
        // boundary -- even if nothing announced itself as PLAYING. Some ad
        // variants never fire a state change at all, and waiting only for one
        // is what let the confirm timer fire mid-ad-pod and skip the trailer.
        // A genuinely ended video cannot reach here: its currentTime stops
        // advancing, which is what progressEpsilonSeconds guards.
        cancel();
      }
      if (!contentConfirmed && progressAccum >= confirmProgressSeconds) {
        // Confirming "this is the content, not an ad" needs something to check
        // against, i.e. the pin. v3.2.0 also accepted an unpinned clip of
        // >= minContentSeconds, but a long unskippable ad passes that too --
        // and confirmation shortens the resume-confirm window below a typical
        // ad-pod gap. Unpinned we stay on the long window.
        if (pinnedDuration > 0 && pinOk(lastKnown.duration)) contentConfirmed = true;
        // No pin (older proxy): a clip longer than any pre-roll ad is content.
        else if (pinnedDuration <= 0
                 && Number.isFinite(lastKnown.duration)
                 && lastKnown.duration >= unpinnedContentSeconds) contentConfirmed = true;
      }
    },

    /**
     * Pin the content's true duration, sampled from player metadata BEFORE
     * any ad rolls (e.g. getDuration() at onReady, or the embed channel's
     * initialDelivery). Enables ad-hardened mode and gates the fast-path.
     * @param {number} d seconds
     */
    setPinnedDuration(d) {
      if (disposed) return;
      if (!Number.isFinite(d) || d <= 0) return;
      enhanced = true;
      pinnedDuration = d;
    },

    /** True once content playback (not an ad) has been confirmed. */
    isContentConfirmed() {
      return contentConfirmed;
    },

    /** Drop any pending confirmation and all per-video state (video swap). */
    reset() {
      fullReset();
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
