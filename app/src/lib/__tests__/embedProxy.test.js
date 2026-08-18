import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import handler from '../../../../landing-page/api/embed.js';

/**
 * Behavioural tests for the DEPLOYED proxy page (landing-page/api/embed.js).
 *
 * These do not re-implement the page's logic — they render the real Edge
 * Function's HTML, lift its <script> out verbatim, and run it inside a vm
 * sandbox with a fake DOM, a fake YouTube iframe and a virtual clock. Driving
 * it with recorded-shape YouTube message sequences shows exactly what the page
 * would post to the native bridge, which is the contract that decides whether
 * a trailer keeps playing or gets skipped.
 *
 * Why this matters more than the other mirrors: the proxy is the only layer
 * that reaches ALREADY-INSTALLED app builds. `npx vercel --prod` changes
 * playback behaviour on every phone immediately; a native fix needs a new
 * TestFlight/App Store build.
 */

const YT_ORIGIN = 'https://www.youtube-nocookie.com';

async function pageScript({ v = 'abc123XYZ', e = 5 } = {}) {
  const res = await handler(
    new Request(`https://trailer-roulette.vercel.app/embed?v=${v}&e=${e}`),
  );
  expect(res.status).toBe(200);
  const html = await res.text();
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  expect(m, 'proxy page must contain an inline script').toBeTruthy();
  return m[1];
}

/** Run the real page script against a fake DOM + virtual clock. */
function harness(source) {
  const native = [];
  const ytCommands = [];
  let messageListener = null;
  let loadListener = null;

  let now = 1000000;
  let seq = 1;
  const timers = new Map();
  const setTimer = (fn, ms, every) => {
    const id = seq++;
    timers.set(id, { at: now + (ms || 0), fn, every: every ? ms || 1 : 0 });
    return id;
  };
  const clear = (id) => { timers.delete(id); };

  function advance(ms) {
    const target = now + ms;
    for (;;) {
      let nextId = null;
      let nextAt = Infinity;
      for (const [id, t] of timers) {
        if (t.at <= target && t.at < nextAt) { nextId = id; nextAt = t.at; }
      }
      if (nextId === null) break;
      const t = timers.get(nextId);
      now = t.at;
      if (t.every) t.at = now + t.every; else timers.delete(nextId);
      t.fn();
    }
    now = target;
  }

  const iframe = {
    addEventListener: (type, fn) => { if (type === 'load') loadListener = fn; },
    contentWindow: { postMessage: (data, origin) => ytCommands.push({ data, origin }) },
  };

  const win = {
    webkit: {
      messageHandlers: {
        trailerEvent: { postMessage: (ev) => native.push(JSON.parse(JSON.stringify(ev))) },
      },
    },
    addEventListener: (type, fn) => { if (type === 'message') messageListener = fn; },
  };

  const sandbox = {
    window: win,
    document: { getElementById: (id) => (id === 'yt' ? iframe : null) },
    setTimeout: (fn, ms) => setTimer(fn, ms, false),
    clearTimeout: clear,
    setInterval: (fn, ms) => setTimer(fn, ms, true),
    clearInterval: clear,
    JSON,
    Math,
    Number,
    String,
    Date: { now: () => now },
    isFinite,
    console,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);

  const api = {
    native,
    ytCommands,
    advance,
    now: () => now,
    win,
    fireIframeLoad() { loadListener?.(); },
    yt(event, info) {
      messageListener?.({ origin: YT_ORIGIN, data: JSON.stringify({ event, info }) });
    },
    state(n) { api.yt('onStateChange', n); },
    info(currentTime, duration) { api.yt('infoDelivery', { currentTime, duration }); },
    initial(currentTime, duration) { api.yt('initialDelivery', { currentTime, duration }); },
    /** Simulate a clip playing: infoDelivery every 500ms of virtual time. */
    play(from, to, duration, stepSeconds = 0.5) {
      for (let t = from; t <= to + 1e-9; t += stepSeconds) {
        api.info(Number(t.toFixed(3)), duration);
        api.advance(stepSeconds * 1000);
      }
    },
    of(kind) { return native.filter((m) => m.kind === kind); },
    endsForwarded() {
      return native.filter((m) => m.kind === 'stateChange' && m.state === 0);
    },
    playingsForwarded() {
      return native.filter((m) => m.kind === 'stateChange' && m.state === 1);
    },
  };
  return api;
}

async function boot(opts) {
  const h = harness(await pageScript(opts));
  h.fireIframeLoad();
  return h;
}

describe('embed proxy — liveness contract with already-installed app builds', () => {
  it('echoes the epoch token on every message', async () => {
    const h = await boot({ e: 42 });
    h.state(1);
    expect(h.native.length).toBeGreaterThan(0);
    for (const m of h.native) expect(m.e).toBe(42);
  });

  it('keeps emitting the 1s liveness heartbeat', async () => {
    const h = await boot();
    h.advance(5000);
    expect(h.of('hb').length).toBeGreaterThanOrEqual(4);
  });

  // The v3.2.0 regression: some pre-roll ad variants keep the CONTENT player
  // UNSTARTED, so onStateChange never fires while the ad runs. Shipped builds
  // (v2.11.0 App Store, v3.1.0 TestFlight) only cancel their 12s
  // "no PLAYING = unplayable" watchdog on a stateChange:1 — the 'hb' heartbeat
  // added in v3.2.0 is an unknown kind to them and is ignored. Without a
  // stateChange:1 inside 12s those builds skip a perfectly live trailer.
  it('announces playback to native during a SILENT pre-roll ad, well before 12s', async () => {
    const h = await boot();
    h.initial(0, 142); // content metadata, before anything plays
    h.play(0, 6, 30); // the ad's own clock — no onStateChange at all
    const playing = h.playingsForwarded();
    expect(playing.length).toBeGreaterThanOrEqual(1);
    expect(h.now()).toBeLessThan(1000000 + 12000);
  });

  it('does not announce playback when nothing is actually playing', async () => {
    const h = await boot();
    h.advance(8000); // page alive, YouTube silent
    expect(h.playingsForwarded()).toHaveLength(0);
  });

  it('hands back an error if nothing ever plays, so no build hangs forever', async () => {
    const h = await boot();
    h.state(5); // CUED — the player exists but never plays
    h.advance(80000);
    expect(h.of('error').length).toBeGreaterThanOrEqual(1);
  });

  it('never reports an error while playback is progressing', async () => {
    const h = await boot();
    h.initial(0, 142);
    h.state(1);
    h.play(0, 100, 142, 1);
    expect(h.of('error')).toHaveLength(0);
  });
});

describe('embed proxy — end detection', () => {
  // An ad pod whose SECOND ad starts silently: the resume-confirm window used
  // to be cancellable only by a state event, so the timer fired mid-pod and
  // native advanced. That is the "skips after a few seconds" report.
  it('does NOT advance when the next ad in a pod starts without a state event', async () => {
    const h = await boot();
    h.initial(0, 142);
    h.state(1);
    h.play(0, 12, 12); // ad 1
    h.state(0); // ad 1 ends
    h.advance(1500); // slow pod gap
    h.play(0, 8, 15); // ad 2 starts SILENTLY (no onStateChange)
    h.advance(8000);
    expect(h.endsForwarded()).toHaveLength(0);
  });

  it('does NOT advance when the real content starts silently after an ad', async () => {
    const h = await boot();
    h.initial(0, 142);
    h.play(0, 10, 10); // silent ad
    h.state(0); // ad ends
    h.advance(2000);
    h.play(0, 20, 142); // content starts silently
    h.advance(8000);
    expect(h.endsForwarded()).toHaveLength(0);
  });

  // A >= 32s unskippable ad reaching its own end looks exactly like a real end
  // unless the CONTENT's duration is known. It must never be mistaken for one.
  it('does NOT advance when a long ad reaches its own end (no content metadata)', async () => {
    const h = await boot();
    // No initialDelivery duration at all — only the ad ever reports one.
    h.play(0, 44, 45, 1);
    h.info(44.8, 45);
    h.state(0); // the AD's end
    expect(h.endsForwarded()).toHaveLength(0);
    h.advance(2000);
    h.play(0, 20, 142); // content finally starts
    h.advance(8000);
    expect(h.endsForwarded()).toHaveLength(0);
  });

  it('does NOT pin an ad duration as the content duration', async () => {
    const h = await boot();
    h.play(0, 20, 45, 1); // ad plays first, reporting its own 45s duration
    const metas = h.of('meta');
    for (const m of metas) expect(m.pin).not.toBeCloseTo(45, 1);
  });

  it('pins the content duration from initialDelivery and forwards it', async () => {
    const h = await boot();
    h.initial(0, 142);
    const metas = h.of('meta');
    expect(metas).toHaveLength(1);
    expect(metas[0].pin).toBeCloseTo(142, 3);
  });

  it('advances immediately at a genuine end of the pinned content', async () => {
    const h = await boot();
    h.initial(0, 142);
    h.state(1);
    h.play(0, 140, 142, 1);
    h.info(141.6, 142);
    h.state(0);
    expect(h.endsForwarded()).toHaveLength(1);
  });

  // Against the v3.1.0 proxy still deployed there is no pin, and v3.2.1 made
  // that mean "never fast-path". Every trailer then sat five seconds on
  // YouTube's replay screen at its end. A clip longer than any pre-roll ad is
  // the trailer, so it advances at once.
  it('advances immediately at a genuine end with no pin, when the clip outruns any ad', async () => {
    const h = await boot();
    h.state(1);
    h.play(0, 140, 142, 1); // no initialDelivery -> no pin
    h.info(141.6, 142);
    h.state(0);
    expect(h.endsForwarded()).toHaveLength(1);
  });

  it('still refuses to fast-path an unpinned clip short enough to be an ad', async () => {
    const h = await boot();
    h.state(1);
    h.play(0, 44, 45, 1); // 45s: could be an unskippable ad
    h.info(44.8, 45);
    h.state(0);
    expect(h.endsForwarded()).toHaveLength(0);
  });

  it('advances a short pinned teaser at its real end', async () => {
    const h = await boot();
    h.initial(0, 24);
    h.state(1);
    h.play(0, 23, 24, 1);
    h.state(0);
    h.advance(6000);
    expect(h.endsForwarded()).toHaveLength(1);
  });

  it('trLoad resets the pin, epoch and liveness for the next video', async () => {
    const h = await boot({ e: 5 });
    h.initial(0, 142);
    h.state(1);
    h.play(0, 10, 142, 1);
    const before = h.native.length;
    expect(h.win.trLoad('NEWID12345', 9)).toBe(true);
    h.initial(0, 61);
    const metas = h.of('meta');
    expect(metas[metas.length - 1].pin).toBeCloseTo(61, 3);
    for (const m of h.native.slice(before)) expect(m.e).toBe(9);
  });

  it('rejects a malformed id in trLoad', async () => {
    const h = await boot();
    expect(h.win.trLoad('../evil', 9)).toBe(false);
  });
});

describe('embed proxy — the state-event subscription (v3.4.2)', () => {
  // v3.4.2 root cause: the page only ever sent { event:'listening' }, which
  // arms the player but never asks YouTube to REPORT its state. The IFrame
  // API delivers onStateChange/onError only after an explicit
  // addEventListener command; without it the widget's state channel is
  // silent for the whole clip — including the ENDED event every
  // end-detection mirror waits on. Proven live (2026-08-16): a listening-only
  // frame delivered ZERO state events across a full video; the same page with
  // +addEventListener delivered PLAYING at ~1.4s and ENDED at the end.
  const subscriptions = (h, name) =>
    h.ytCommands.filter((c) => {
      let d;
      try { d = JSON.parse(c.data); } catch { return false; }
      return d.event === 'command' && d.func === 'addEventListener' &&
             Array.isArray(d.args) && d.args[0] === name;
    });

  it('subscribes to onStateChange and onError after the iframe loads', async () => {
    const h = await boot();
    expect(subscriptions(h, 'onStateChange').length).toBeGreaterThanOrEqual(1);
    expect(subscriptions(h, 'onError').length).toBeGreaterThanOrEqual(1);
  });

  it('never double-subscribes once state events are flowing', async () => {
    const h = await boot();
    h.state(1); // first state event — the subscription demonstrably landed
    h.advance(5000); // past the 2.5s retry window
    expect(subscriptions(h, 'onStateChange')).toHaveLength(1);
    expect(subscriptions(h, 'onError')).toHaveLength(1);
  });

  it('retries the subscription once if no state event ever arrives', async () => {
    const h = await boot();
    h.advance(4000); // load-time send + 2.5s retry, widget still silent
    expect(subscriptions(h, 'onStateChange')).toHaveLength(2);
    expect(subscriptions(h, 'onError')).toHaveLength(2);
  });

  it('does not re-subscribe on a trLoad swap once events are flowing', async () => {
    const h = await boot();
    h.state(1);
    expect(h.win.trLoad('NEWID12345', 9)).toBe(true);
    h.advance(3000); // past the 1.2s swap re-assert
    expect(subscriptions(h, 'onStateChange')).toHaveLength(1);
  });
});

describe('embed proxy — the no-playback cap is narrow', () => {
  it('does not fire when the player reported PLAYING but sent no progress', async () => {
    const res = await handler(new Request('https://trailer-roulette.vercel.app/embed?v=abc123XYZ&e=1'));
    const src = (await res.text()).match(/<script>([\s\S]*?)<\/script>/)[1];
    const h = harness(src);
    h.fireIframeLoad();
    h.state(1); // YouTube says it is playing; infoDelivery never arrives
    h.advance(90000);
    expect(h.of('error')).toHaveLength(0);
  });
});
