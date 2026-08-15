import { describe, it, expect, vi } from 'vitest';
import { createEndDetector, END_DETECT_DEFAULTS } from '../endDetection.js';

// A tiny controllable clock so tests are deterministic (no real waiting).
function fakeClock() {
  let seq = 1;
  const timers = new Map();
  return {
    setTimer(fn, ms) {
      const id = seq++;
      timers.set(id, { fn, ms });
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
    // Fire every currently-scheduled timer (simulate confirmMs elapsing).
    flush() {
      for (const [id, t] of [...timers]) {
        timers.delete(id);
        t.fn();
      }
    },
    pending() {
      return timers.size;
    },
  };
}

describe('createEndDetector', () => {
  it('exposes sane defaults', () => {
    expect(END_DETECT_DEFAULTS.confirmMs).toBeGreaterThan(0);
    expect(END_DETECT_DEFAULTS.minContentSeconds).toBeGreaterThan(0);
  });

  it('reports a real end immediately when playback reached the video duration', () => {
    const clock = fakeClock();
    const onEnd = vi.fn();
    const d = createEndDetector({
      onEnd,
      getProgress: () => ({ currentTime: 149.6, duration: 150 }),
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    d.onState(1); // playing
    d.onState(0); // ended at the true end
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd.mock.calls[0][0].confirmedBy).toBe('progress');
    expect(clock.pending()).toBe(0);
  });

  it('does NOT advance when a pre-roll ad ends and content then plays', () => {
    const clock = fakeClock();
    const onEnd = vi.fn();
    // During the ad the player reports the ad's own short time/duration.
    const d = createEndDetector({
      onEnd,
      getProgress: () => ({ currentTime: 15, duration: 15 }), // "complete" but only 15s
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    d.onState(1); // ad playing
    d.onState(0); // ad ends -> spurious ENDED (15s < minContentSeconds: no fast path)
    expect(onEnd).not.toHaveBeenCalled();
    expect(clock.pending()).toBe(1); // waiting to confirm
    d.onState(1); // real content starts -> cancels the pending end
    expect(clock.pending()).toBe(0);
    clock.flush();
    expect(onEnd).not.toHaveBeenCalled(); // never advanced on the ad
  });

  it('confirms a real end via timeout when no progress data is available', () => {
    const clock = fakeClock();
    const onEnd = vi.fn();
    const d = createEndDetector({
      onEnd,
      getProgress: () => null, // bare state numbers only
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    d.onState(1);
    d.onState(0); // candidate end
    expect(onEnd).not.toHaveBeenCalled();
    clock.flush(); // confirmMs elapses with no resume
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd.mock.calls[0][0].confirmedBy).toBe('timeout');
  });

  it('treats BUFFERING after an ad-boundary ENDED as a resume (cancels)', () => {
    const clock = fakeClock();
    const onEnd = vi.fn();
    const d = createEndDetector({
      onEnd,
      getProgress: () => null,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    d.onState(0); // candidate end
    expect(clock.pending()).toBe(1);
    d.onState(3); // BUFFERING (content loading after the ad)
    expect(clock.pending()).toBe(0);
    clock.flush();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('handles an ad pod (multiple ad boundaries) then the real end', () => {
    const clock = fakeClock();
    const onEnd = vi.fn();
    let progress = { currentTime: 8, duration: 8 };
    const d = createEndDetector({
      onEnd,
      getProgress: () => progress,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    d.onState(1);
    d.onState(0); // ad 1 ends
    d.onState(1); // ad 2 starts (cancels)
    d.onState(0); // ad 2 ends
    d.onState(1); // content starts (cancels)
    expect(onEnd).not.toHaveBeenCalled();
    progress = { currentTime: 120, duration: 121 };
    d.onState(0); // real end
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd.mock.calls[0][0].confirmedBy).toBe('progress');
  });

  it('treats a short teaser with no ad as a real end after confirmation', () => {
    const clock = fakeClock();
    const onEnd = vi.fn();
    const d = createEndDetector({
      onEnd,
      getProgress: () => ({ currentTime: 24, duration: 24 }), // 24s < minContentSeconds
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    d.onState(0);
    expect(onEnd).not.toHaveBeenCalled(); // can't fast-path a short clip
    clock.flush(); // nothing resumed -> real end
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd.mock.calls[0][0].confirmedBy).toBe('timeout');
  });

  it('a stale candidate end is superseded by a later real one', () => {
    const clock = fakeClock();
    const onEnd = vi.fn();
    let progress = null;
    const d = createEndDetector({
      onEnd,
      getProgress: () => progress,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    d.onState(0); // ad boundary, no progress -> pending
    d.onState(1); // resume cancels
    progress = { currentTime: 200, duration: 200 };
    d.onState(0); // real end via progress
    clock.flush();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('reset() drops a pending confirmation (manual video swap)', () => {
    const clock = fakeClock();
    const onEnd = vi.fn();
    const d = createEndDetector({
      onEnd,
      getProgress: () => null,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    d.onState(0);
    expect(d.isPending()).toBe(true);
    d.reset();
    expect(d.isPending()).toBe(false);
    clock.flush();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('dispose() cancels a pending confirmation and blocks further ends', () => {
    const clock = fakeClock();
    const onEnd = vi.fn();
    const d = createEndDetector({
      onEnd,
      getProgress: () => null,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    d.onState(0);
    expect(clock.pending()).toBe(1);
    d.dispose();
    expect(clock.pending()).toBe(0);
    d.onState(0); // ignored after dispose
    expect(clock.pending()).toBe(0);
    clock.flush();
    expect(onEnd).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// v3.2.0 ad-hardened mode (onProgress feeds + pinned duration)
// ---------------------------------------------------------------------------

describe('createEndDetector — ad-hardened mode', () => {
  // Helper: capture the ms of the most recent confirm timer.
  function trackedClock() {
    const clock = fakeClock();
    const original = clock.setTimer;
    clock.lastMs = null;
    clock.setTimer = (fn, ms) => {
      clock.lastMs = ms;
      return original(fn, ms);
    };
    return clock;
  }

  it('uses the LONG pre-content confirm window before content is confirmed', () => {
    const clock = trackedClock();
    const onEnd = vi.fn();
    const d = createEndDetector({
      onEnd,
      getProgress: () => ({ currentTime: 15, duration: 15 }), // ad snapshot
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    // Feed ad progress (short bumper, d=15 < minContentSeconds) — enhanced
    // mode on, but this can never confirm as content.
    d.onProgress(2, 15);
    d.onProgress(8, 15);
    d.onProgress(15, 15);
    expect(d.isContentConfirmed()).toBe(false);
    d.onState(0); // ad boundary ENDED
    expect(onEnd).not.toHaveBeenCalled();
    expect(clock.lastMs).toBe(END_DETECT_DEFAULTS.preContentConfirmMs); // 5s, not 1.2s
    d.onState(3); // content buffering 3-4s later (slow ad-pod gap) — cancels
    clock.flush();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('uses the SHORT confirm window once content has confirmed', () => {
    const clock = trackedClock();
    const onEnd = vi.fn();
    const d = createEndDetector({
      onEnd,
      getProgress: () => ({ currentTime: 100, duration: 140 }), // mid-content pause snapshot
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    d.setPinnedDuration(140); // content metadata, sampled before playback
    d.onProgress(1, 140);
    d.onProgress(3, 140);
    d.onProgress(5, 140); // >= 3s forward on the pinned clip -> content confirmed
    expect(d.isContentConfirmed()).toBe(true);
    d.onState(0); // ENDED mid-content (won't fast-path: t far from d)
    expect(clock.lastMs).toBe(END_DETECT_DEFAULTS.confirmMs);
  });

  // Confirmation is a claim that THIS clip is the trailer. Without pinned
  // content metadata there is nothing to check that against: a 45s unskippable
  // ad satisfies any "looks long enough" rule just as well as a trailer does.
  // Confirming off an ad shortens the resume-confirm window below a typical
  // ad-pod gap, which is what cuts trailers short.
  it('never confirms content without a pin, and keeps the LONG window', () => {
    const clock = trackedClock();
    const onEnd = vi.fn();
    const d = createEndDetector({
      onEnd,
      getProgress: () => ({ currentTime: 44.6, duration: 45 }), // a long ad's own clock
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    d.onProgress(10, 45);
    d.onProgress(25, 45);
    d.onProgress(44, 45); // 34s of forward progress on a 45s clip
    expect(d.isContentConfirmed()).toBe(false);
    d.onState(0); // the ad's own end — must NOT fast-path
    expect(onEnd).not.toHaveBeenCalled();
    expect(clock.lastMs).toBe(END_DETECT_DEFAULTS.preContentConfirmMs);
  });

  // The ad variant this whole release is about never fires a state change, so
  // an ad boundary's pending end has to be cancellable by playback itself.
  it('forward progress cancels a pending end when no state event fires', () => {
    const clock = trackedClock();
    const onEnd = vi.fn();
    const d = createEndDetector({
      onEnd,
      getProgress: () => null,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    d.setPinnedDuration(142);
    d.onProgress(0, 12);
    d.onProgress(11, 12); // ad 1 plays out
    d.onState(0); // ad 1 ends
    expect(d.isPending()).toBe(true);
    // Ad 2 starts silently — no PLAYING, no BUFFERING, just progress.
    d.onProgress(0.5, 15);
    d.onProgress(1.5, 15);
    expect(d.isPending()).toBe(false);
    clock.flush();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('a player parked at the end does not cancel a pending end', () => {
    const clock = trackedClock();
    const onEnd = vi.fn();
    const d = createEndDetector({
      onEnd,
      getProgress: () => null,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    d.setPinnedDuration(140);
    d.onProgress(138, 140);
    d.onState(0); // real end
    expect(d.isPending()).toBe(true);
    // Trailing samples that re-report (or barely nudge) the same position are
    // not playback and must not keep the trailer on screen forever.
    d.onProgress(140, 140);
    d.onProgress(140, 140);
    d.onProgress(140.05, 140);
    expect(d.isPending()).toBe(true);
    clock.flush();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('fast-paths a real end once content confirmed and duration matches the pin', () => {
    const clock = trackedClock();
    const onEnd = vi.fn();
    let p = { currentTime: 0, duration: 140 };
    const d = createEndDetector({
      onEnd,
      getProgress: () => p,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    d.setPinnedDuration(140); // from onReady metadata, before ads roll
    d.onState(1);
    d.onProgress(1, 140);
    d.onProgress(4, 140);
    d.onProgress(7, 140);
    expect(d.isContentConfirmed()).toBe(true);
    p = { currentTime: 139.2, duration: 140 };
    d.onState(0); // true end
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd.mock.calls[0][0].confirmedBy).toBe('progress');
  });

  it('a long (>= 32s) unskippable ad can NOT fast-path a false end when pinned', () => {
    const clock = trackedClock();
    const onEnd = vi.fn();
    let p = { currentTime: 0, duration: 45 }; // the AD's own time/duration
    const d = createEndDetector({
      onEnd,
      getProgress: () => p,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    d.setPinnedDuration(142); // content metadata pinned before the ad rolled
    d.onState(1); // ad starts (in-stream variant reports PLAYING)
    d.onProgress(10, 45);
    d.onProgress(25, 45);
    d.onProgress(44, 45);
    // 34s of forward progress, but d=45 != pin 142 -> NOT content.
    expect(d.isContentConfirmed()).toBe(false);
    p = { currentTime: 44.8, duration: 45 };
    d.onState(0); // ad reaches its own end — would fast-path in v3.1.0
    expect(onEnd).not.toHaveBeenCalled();
    expect(clock.lastMs).toBe(END_DETECT_DEFAULTS.preContentConfirmMs);
    d.onState(1); // content finally starts
    clock.flush();
    expect(onEnd).not.toHaveBeenCalled(); // survived the long ad
  });

  it('a pinned SHORT teaser confirms as content and ends via the short window', () => {
    const clock = trackedClock();
    const onEnd = vi.fn();
    const d = createEndDetector({
      onEnd,
      getProgress: () => ({ currentTime: 23.8, duration: 24 }),
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    d.setPinnedDuration(24); // 24s teaser — shorter than minContentSeconds
    d.onState(1);
    d.onProgress(5, 24);
    d.onProgress(10, 24); // 5s forward on a d≈pin clip -> content confirmed
    expect(d.isContentConfirmed()).toBe(true);
    d.onState(0); // real end (no fast-path: t < minContentSeconds)
    expect(clock.lastMs).toBe(END_DETECT_DEFAULTS.confirmMs); // snappy 1.2s
    clock.flush();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('progress accumulation resets at each ENDED boundary (ad pods)', () => {
    const clock = trackedClock();
    const onEnd = vi.fn();
    const d = createEndDetector({
      onEnd,
      getProgress: () => null,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    d.setPinnedDuration(120);
    // Ad 1: 2s of progress at d=15 — no confirm (d != pin).
    d.onProgress(1, 15);
    d.onProgress(3, 15);
    d.onState(0); // ad 1 ends -> epoch reset
    d.onState(1); // ad 2 starts
    // Ad 2 progress must not inherit ad 1's accumulation.
    d.onProgress(1, 20);
    d.onProgress(2, 20);
    expect(d.isContentConfirmed()).toBe(false);
    d.onState(0); // ad 2 ends
    d.onState(1); // content starts
    d.onProgress(1, 120);
    d.onProgress(5, 120);
    expect(d.isContentConfirmed()).toBe(true);
    clock.flush();
    expect(onEnd).not.toHaveBeenCalled(); // pod never produced a false end...
  });

  it('ignores implausible time jumps and junk pins', () => {
    const clock = trackedClock();
    const onEnd = vi.fn();
    const d = createEndDetector({
      onEnd,
      getProgress: () => null,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    d.setPinnedDuration(NaN); // ignored
    d.setPinnedDuration(-5); // ignored
    d.setPinnedDuration(Infinity); // ignored
    d.setPinnedDuration(140); // the only valid pin wins
    d.onProgress(0, 140);
    d.onProgress(60, 140); // +60s in one sample — a seek/swap glitch, not watched playback
    expect(d.isContentConfirmed()).toBe(false);
    d.onProgress(NaN, NaN); // junk sample is harmless
    d.onProgress(61, 140);
    d.onProgress(64, 140); // legit +3s accumulates -> confirms against the pin
    expect(d.isContentConfirmed()).toBe(true);
  });

  it('reset() clears the pin, confirmation, and samples for the next video', () => {
    const clock = trackedClock();
    const onEnd = vi.fn();
    const d = createEndDetector({
      onEnd,
      getProgress: () => null,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    d.setPinnedDuration(140);
    d.onProgress(1, 140);
    d.onProgress(6, 140);
    expect(d.isContentConfirmed()).toBe(true);
    d.reset(); // video swap
    expect(d.isContentConfirmed()).toBe(false);
    // Next video: an ENDED with no fresh data uses the long pre-content window.
    d.onState(0);
    expect(clock.lastMs).toBe(END_DETECT_DEFAULTS.preContentConfirmMs);
  });

  // v3.2.1 refused to fast-path without a pin. The pin only exists once the
  // newer proxy is deployed, so on the live app that meant a five-second stall
  // at the end of every trailer, filled by YouTube's own replay button.
  it('fast-paths an unpinned real end when the clip outruns any pre-roll ad', () => {
    const clock = trackedClock();
    const onEnd = vi.fn();
    let p = { currentTime: 0, duration: 142 };
    const d = createEndDetector({
      onEnd,
      getProgress: () => p,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    d.onProgress(1, 142); // enhanced mode, but no pin ever arrives
    d.onProgress(5, 142);
    p = { currentTime: 141.2, duration: 142 };
    d.onState(0);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd.mock.calls[0][0].confirmedBy).toBe('progress');
  });

  it('does NOT fast-path an unpinned clip short enough to be an ad', () => {
    const clock = trackedClock();
    const onEnd = vi.fn();
    let p = { currentTime: 0, duration: 45 };
    const d = createEndDetector({
      onEnd,
      getProgress: () => p,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    d.onProgress(10, 45);
    d.onProgress(25, 45);
    p = { currentTime: 44.7, duration: 45 };
    d.onState(0);
    expect(onEnd).not.toHaveBeenCalled();
    expect(clock.lastMs).toBe(END_DETECT_DEFAULTS.preContentConfirmMs);
  });

  it('legacy callers (no feeds, no pin) keep exact v3.1.0 fast-path behavior', () => {
    const clock = trackedClock();
    const onEnd = vi.fn();
    const d = createEndDetector({
      onEnd,
      getProgress: () => ({ currentTime: 149.6, duration: 150 }),
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    d.onState(1);
    d.onState(0);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd.mock.calls[0][0].confirmedBy).toBe('progress');
  });
});
