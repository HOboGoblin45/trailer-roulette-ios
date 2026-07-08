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
