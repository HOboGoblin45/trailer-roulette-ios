/**
 * Trailer Roulette YouTube embed proxy — server-rendered.
 *
 * v1.9.0: this is the proxy that the iOS TrailerPlayer plugin navigates
 * to directly as the WKWebView's main frame. Verified in headless WebKit
 * with iOS UA — Rick Astley plays in 2-3 seconds.
 *
 * v3.1.0: ad-aware end detection. YouTube fires onStateChange ENDED (0) when
 * a pre-roll AD finishes, before the real video plays; forwarding that raw
 * event cut trailers off after ~15s. The page now tracks playback progress
 * (infoDelivery currentTime/duration) and only forwards a real end.
 *
 * v3.2.0: ad-HARDENED detection + liveness heartbeat. Three residual holes
 * fixed:
 *   1. SILENT ADS vs the native 12s watchdog (the "~13 seconds" regression).
 *      Some pre-roll ad variants keep the content player in UNSTARTED — no
 *      PLAYING (1) fires while the ad runs. This page only forwarded state
 *      changes, so during such an ad native heard NOTHING, its "no PLAYING
 *      within 12s = dead video" watchdog fired, and every ad-backed trailer
 *      was skipped at ~13s. The page now emits a 1s HEARTBEAT
 *      ({ kind:'hb', state, t, d, yt, cc }) so native can tell "alive, ad
 *      still rolling" from "actually dead" and only give up on the latter.
 *   2. SLOW AD-POD GAPS: the 1.2s resume-confirm window falsely advanced when
 *      the next ad / the content took 2-4s to start after an ad's ENDED. The
 *      confirm window is now 5s until content playback is CONFIRMED (>= 3s of
 *      observed forward progress on a clip whose duration matches the pinned
 *      content metadata), then 1.2s for snappy real ends.
 *   3. LONG-AD FAST-PATH: a >= 32s unskippable ad reaching its own end looked
 *      exactly like a "real end" to the fast-path. The fast-path now also
 *      requires content confirmation and a pin match. The content duration is
 *      pinned from initialDelivery metadata BEFORE any ad plays and forwarded
 *      to native as { kind:'meta', pin }.
 *
 * v3.2.1: the v3.2.0 work was correct about the cause and incomplete about the
 * cure. Three holes, all the same mistake — trusting onStateChange in a
 * situation defined by onStateChange not firing:
 *   1. UNREACHABLE FIX. 'hb' is a v3.2.0 invention, so only a v3.2.0+ native
 *      build benefits. Every phone in the wild runs v2.11.0 or v3.1.0, whose
 *      12s watchdog is cancelled by exactly one thing: a stateChange:1. During
 *      a silent ad this page sent them nothing they understood, so redeploying
 *      the proxy could not fix a single installed app. The page now announces
 *      live playback as a stateChange:1 (marked syn:true) the moment playback
 *      demonstrably advances — the vocabulary every build already speaks.
 *   2. SILENT AD-POD ADVANCE. The resume-confirm timer was cancellable only by
 *      a state event. When the next ad in a pod (or the content) started
 *      silently, nothing cancelled it, so the page forwarded a FALSE ENDED and
 *      native skipped the trailer a few seconds in. Forward playback progress
 *      now cancels a pending end; a genuinely ended video cannot, because its
 *      currentTime stops advancing.
 *   3. AD DURATION PINNED AS CONTENT. The pin accepted any duration seen
 *      before a PLAYING state — which, for the very ad variants at issue, is
 *      the ad's own duration. A mis-pin makes the ad look like the content and
 *      lets the ad's end fast-path a false advance. The pin now comes only
 *      from initialDelivery (player metadata for the cued video), and the
 *      fast-path requires a pin rather than treating "no pin" as a match.
 *
 * v3.4.2: THE MISSING EVENT. The root cause of every "trailer does not
 * advance" report since v1.x: this page only ever sent the IFrame API's
 * { event:'listening' } message, which arms the player but never asks YouTube
 * to REPORT its state. The IFrame API delivers onStateChange (and onError)
 * only after an explicit addEventListener command; without one, infoDelivery
 * keeps streaming (so liveness/end-detection timers all believe the page is
 * healthy) while the state channel stays silent for the whole clip —
 * including the ENDED event every end-detection mirror waits on. Five
 * releases tuned the same end-detection logic against that event; none of
 * it could run because the event never arrived. The page now sends
 * addEventListener('onStateChange') and addEventListener('onError') when
 * the player announces itself ready (the moment proven live to accept the
 * subscription), with one retry 2s later if no state event has arrived.
 * The subscription is player-level and survives loadVideoById, so a trLoad
 * swap never re-subscribes (no duplicate events).
 *
 * All additions are backward compatible: older native builds ignore unknown
 * kinds ('hb', 'meta') and extra fields, and this page still forwards the
 * same { kind:'stateChange', state, t, d } events they expect.
 *
 * Why this works where every other approach failed:
 *   - The page is at https://trailer-roulette.vercel.app/embed (a real
 *     third-party https origin from YouTube's perspective)
 *   - The YouTube iframe inside this page sees a normal Referer of
 *     https://trailer-roulette.vercel.app/ — not youtube.com (which
 *     YT rejects as a self-embed) and not capacitor:// (which YT rejects
 *     as not a real origin)
 *   - enablejsapi=1 lets us listen for player events via postMessage
 *   - The page's own script forwards events to native via
 *     webkit.messageHandlers.trailerEvent, which the iOS plugin's
 *     userContentController is wired to
 *
 * Test scripts that verify this works:
 *   scripts/test-vercel-direct.mjs (headless WebKit, iOS UA)
 *
 * Endpoint:  GET https://trailer-roulette.vercel.app/api/embed?v=KEY
 * Rewrite:   /embed → /api/embed (configured in vercel.json)
 */

export const config = {
  runtime: 'edge',
};

const VALID_ID = /^[A-Za-z0-9_-]{6,20}$/;

function safeText(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export default async function handler(request) {
  const url = new URL(request.url);
  const v = url.searchParams.get('v') || '';
  const autoplay = url.searchParams.get('autoplay') === '0' ? '0' : '1';
  const mute = url.searchParams.get('mute') === '1' ? '1' : '0';
  const controls = url.searchParams.get('controls') === '0' ? '0' : '1';
  const ivLoadPolicy = url.searchParams.get('iv_load_policy') === '3' ? '3' : '1';
  const fs = url.searchParams.get('fs') === '0' ? '0' : '1';
  // Epoch token (v3.2.0): native hands us its per-load token; we echo it on
  // every message so native can drop stale messages that cross a load/swap
  // boundary. Absent (older native builds) = 0, harmless.
  const epoch = String(parseInt(url.searchParams.get('e') || '0', 10) || 0);

  if (!VALID_ID.test(v)) {
    return new Response(`<!doctype html><meta charset=utf-8><title>Trailer</title><body style="margin:0;background:#000;color:#aaa;font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh">Invalid or missing video id.</body>`, {
      status: 400,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }

  // The IFRAME src must include `enablejsapi=1` for postMessage events
  // to fire. `origin` should match the page hosting the iframe so YT's
  // origin-validation passes; that's our Vercel host.
  const ytSrc =
    `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v)}` +
    `?autoplay=${autoplay}` +
    `&mute=${mute}` +
    `&controls=${controls}` +
    `&iv_load_policy=${ivLoadPolicy}` +
    `&fs=${fs}` +
    `&playsinline=1` +
    `&rel=0` +
    `&modestbranding=1` +
    `&enablejsapi=1` +
    `&origin=${encodeURIComponent('https://trailer-roulette.vercel.app')}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>Trailer</title>
<style>
  html, body { margin:0; padding:0; height:100%; background:#000; overflow:hidden; }
  iframe { border:0; width:100%; height:100%; display:block; }
</style>
</head>
<body>
<iframe
  id="yt"
  src="${safeText(ytSrc)}"
  title="Trailer ${safeText(v)}"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
  allowfullscreen
  referrerpolicy="strict-origin-when-cross-origin"
  loading="eager"
></iframe>
<script>
(function () {
  // Bridge to native (iOS WKWebView). webkit.messageHandlers.trailerEvent
  // is set up by the TrailerPlayer.swift plugin's userContentController.
  // On desktop browsers, this is a no-op — the page still plays normally.
  // Every message carries the current epoch token (v3.2.0) so native can
  // drop messages that straddle a video load/swap boundary.
  var trEpoch = ${epoch};
  function toNative(event) {
    try {
      event.e = trEpoch;
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.trailerEvent) {
        window.webkit.messageHandlers.trailerEvent.postMessage(event);
      }
    } catch (e) {}
  }

  // Tell the YT iframe we're listening. Must be done after the iframe
  // loads. We send the message a few times in case the first attempts
  // race the iframe's own bootstrap.
  var iframe = document.getElementById('yt');
  function sendListening() {
    try {
      iframe.contentWindow.postMessage(
        JSON.stringify({ event: 'listening', id: '${v}', channel: 'widget' }),
        'https://www.youtube-nocookie.com'
      );
    } catch (e) {}
  }
  iframe.addEventListener('load', function () {
    sendListening();
    setTimeout(sendListening, 500);
    setTimeout(sendListening, 1500);
    toNative({ kind: 'iframeLoaded' });
  });

  // v3.4.2: the IFrame API only delivers onStateChange / onError AFTER we
  // send an explicit addEventListener command. This page previously only
  // ever sent { event:'listening' }; that arms the player for WHAT TO PLAY
  // but never asks YouTube to TELL us what it is doing. The API then reports
  // the video is playing (infoDelivery currentTime advances, which is all the
  // liveness/heartbeat logic needs), but the player's own state channel stays
  // silent for the entire clip — including its end. Every build's end
  // detection waits on onStateChange:0 (ENDED), so the event never arrives,
  // no trailer ever auto-advances, and the app strands on YouTube's replay
  // screen. Five releases "moved" this bug by retuning the same end-detection
  // logic against an event that never reached the page: none of it could run.
  // The subscription must be sent once per PLAYER LIFETIME, not per video:
  // it survives loadVideoById (trLoad) and playlist advance, so re-sending it
  // on every swap would just risk duplicate events. It is anchored to the
  // player's OWN "ready" announcement (see the onReady handler): the widget
  // drops commands posted before it has booted, and onReady is the earliest
  // point proven (live A/B, 2026-08-16) to accept the subscription and
  // deliver PLAYING/ENDED in return. A latch armed by the first received
  // state event prevents the 2s retry from ever double-subscribing.
  var playerSubscriptionSent = false; // the command has been POSTed
  var youtubeEventsSeen = false;      // an actual onStateChange has arrived
  function subscribeToPlayerEvents() {
    if (youtubeEventsSeen || playerSubscriptionSent) return;
    playerSubscriptionSent = true;
    try {
      iframe.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: 'addEventListener', args: ['onStateChange'] }),
        'https://www.youtube-nocookie.com'
      );
      iframe.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: 'addEventListener', args: ['onError'] }),
        'https://www.youtube-nocookie.com'
      );
    } catch (e) {}
  }
  function notePlayerEvent() { youtubeEventsSeen = true; }

  // Ad-hardened end detection (v3.2.0, corrected v3.2.1) -----------------
  // Mirrors app/src/lib/endDetection.js — see that file for the full design.
  var CONFIRM_MS = 1200, PRE_CONTENT_CONFIRM_MS = 5000;
  var MIN_CONTENT = 32, END_EPS = 1.5, PIN_EPS = 2.5, CONFIRM_PROGRESS = 3;
  // With no pin, a clip longer than this is the trailer, not a pre-roll ad.
  var UNPINNED_CONTENT = 65;
  // A sample must advance by more than this to count as playback. Anything
  // smaller is the player re-reporting where it already is — which is exactly
  // what it does once a video has genuinely ENDED, so a real end can never be
  // mistaken for "still playing".
  var PROGRESS_EPS = 0.25;
  // Pre-v3.2.0 builds only cancel their 12s "no PLAYING = unplayable"
  // watchdog on a stateChange:1, so announce liveness comfortably before it.
  var SYN_PLAYING_MS = 9000;
  // Having silenced that watchdog we own its job: if nothing EVER plays, hand
  // back an error so every build skips rather than sitting on a black screen.
  var NO_PLAYBACK_CAP_MS = 75000;
  var lastTime = 0, lastDuration = 0, lastState = -1, endTimer = null;
  var sawYt = false;           // any message accepted from the YT iframe
  var pin = 0;                 // content duration pinned from initialDelivery, 0 = none
  var pinSent = false;
  var contentConfirmed = false;
  var progressAccum = 0, epochLastT = null;
  var announcedPlaying = false; // a stateChange:1 has reached native this load
  var everProgressed = false;   // playback has demonstrably advanced this load
  var liveSince = Date.now();   // start of this load/swap
  var capFired = false;

  function clearEndTimer() { if (endTimer) { clearTimeout(endTimer); endTimer = null; } }
  function forwardEnded() { clearEndTimer(); toNative({ kind: 'stateChange', state: 0, t: lastTime, d: lastDuration }); }
  function pinOk(d) { return !pin || (isFinite(d) && Math.abs(d - pin) <= PIN_EPS); }
  function resetEpoch() { progressAccum = 0; epochLastT = null; }
  function resetProgress() {
    lastTime = 0; lastDuration = 0; lastState = -1;
    pin = 0; pinSent = false; contentConfirmed = false;
    announcedPlaying = false; everProgressed = false; capFired = false;
    liveSince = Date.now();
    resetEpoch(); clearEndTimer();
  }

  // Tell native that playback is live, in the one vocabulary EVERY shipped
  // build understands. The 'hb' heartbeat below carries richer liveness, but
  // builds older than v3.2.0 ignore unknown kinds and skip the trailer at 12s;
  // a stateChange:1 is what actually cancels their watchdog. 'syn' marks it as
  // proxy-synthesised so v3.2.1+ native can keep its own 75s cap running.
  function announcePlaying(syn) {
    if (announcedPlaying) return;
    announcedPlaying = true;
    toNative({ kind: 'stateChange', state: 1, t: lastTime, d: lastDuration, syn: !!syn });
  }

  // Liveness heartbeat (v3.2.0): native's watchdog used to require PLAYING
  // within 12s — but some ad variants keep the content player UNSTARTED while
  // the ad rolls, so native heard silence and skipped live trailers at ~13s.
  // A 1s heartbeat lets native distinguish "alive, ad rolling" from "dead".
  setInterval(function () {
    toNative({ kind: 'hb', state: lastState, t: lastTime, d: lastDuration, yt: sawYt, cc: contentConfirmed });
    var age = Date.now() - liveSince;
    // The YT player is present and talking but has not announced playback —
    // the silent-ad case. Vouch for it before old builds give up at 12s.
    if (!announcedPlaying && sawYt && age >= SYN_PLAYING_MS) announcePlaying(true);
    // Nothing has played and the player never even claimed to be playing.
    // A dead video id skips instantly via onError, so this only catches the
    // rare stalled case — but old builds no longer have a watchdog of their
    // own, so something has to.
    if (!capFired && !everProgressed && lastState !== 1 && age >= NO_PLAYBACK_CAP_MS) {
      capFired = true;
      toNative({ kind: 'error', code: 5 });
    }
  }, 1000);

  // Gapless swap (v2.9.0): swap the playing video WITHOUT reloading the page.
  // The native player calls window.trLoad('NEWID') instead of navigating to a
  // fresh /embed?v=NEWID — the YT player is already initialized, so this is a
  // ~0.5s in-player swap rather than a 2-3s cold page load. Older app builds
  // that don't call this are unaffected (the page still autoplays ?v= on load).
  var VALID = /^[A-Za-z0-9_-]{6,20}$/;
  window.trLoad = function (id, e) {
    if (!VALID.test(id || '')) return false;
    try {
      if (typeof e === 'number' && isFinite(e)) trEpoch = e; // new epoch (v3.2.0 native)
      resetProgress(); // new video — forget the previous clip's progress/pin
      iframe.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: 'loadVideoById', args: [String(id)] }),
        'https://www.youtube-nocookie.com'
      );
      // Re-assert our event listener against the freshly-loaded video.
      setTimeout(sendListening, 200);
      setTimeout(sendListening, 800);
      // The state subscription is player-level and survives loadVideoById,
      // so this only fires if events never arrived at all (defensive).
      setTimeout(function () {
        if (!youtubeEventsSeen) { playerSubscriptionSent = false; subscribeToPlayerEvents(); }
      }, 1200);
      return true;
    } catch (e) { return false; }
  };

  // Listen for postMessages from the YT iframe and forward to native.
  // YT IFrame API messages are JSON-encoded strings with shape:
  //   { event: 'onStateChange', info: 1 }   // 1 = PLAYING, 0 = ENDED, etc.
  //   { event: 'onError', info: 101 }
  //   { event: 'onReady' }
  //   { event: 'initialDelivery', info: { currentTime, duration, ... } }
  //   { event: 'infoDelivery', info: { currentTime, duration, ... } }
  window.addEventListener('message', function (e) {
    if (!e || !e.data) return;
    if (e.origin !== 'https://www.youtube-nocookie.com' && e.origin !== 'https://www.youtube.com') return;
    var data = e.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (err) { return; }
    }
    if (!data || !data.event) return;
    sawYt = true;
    if (data.event === 'onStateChange') notePlayerEvent();

    if (data.event === 'infoDelivery' || data.event === 'initialDelivery') {
      var info = data.info || {};
      var t = info.currentTime, d = info.duration;
      var hasT = (typeof t === 'number' && isFinite(t));
      var hasD = (typeof d === 'number' && isFinite(d) && d > 0);
      if (hasD) lastDuration = d;
      // PIN: initialDelivery is the player's metadata push for the CUED video,
      // sent before anything plays, so its duration is the CONTENT's.
      // infoDelivery during a pre-roll reports the AD's duration — and the ad
      // variants this release is about never fire PLAYING, so "no PLAYING yet"
      // was never enough to tell the two apart. Pinning an ad's duration is
      // worse than having no pin at all: it makes the ad look like content and
      // lets the ad's own end fast-path a false advance. Only initialDelivery,
      // and only while nothing has played.
      if (hasD && !pin && data.event === 'initialDelivery' && !everProgressed) {
        pin = d;
        if (!pinSent) { pinSent = true; toNative({ kind: 'meta', pin: pin }); }
      }
      if (hasT) {
        // Accumulate genuinely-watched forward progress (ignore seek jumps).
        var moved = (epochLastT !== null && t > epochLastT + PROGRESS_EPS && (t - epochLastT) < 8);
        if (moved) { progressAccum += (t - epochLastT); everProgressed = true; }
        epochLastT = t;
        lastTime = t;
        if (moved) {
          // Playback is demonstrably live. Whatever ENDED we are holding was
          // an ad boundary, even though nothing announced itself as PLAYING —
          // that silence is precisely the ad variant behind this bug, and
          // waiting only for a state event is what let the confirm timer fire
          // mid-ad-pod and skip the trailer. A genuinely ended video never
          // gets here: its currentTime stops advancing.
          clearEndTimer();
          announcePlaying(true);
        }
        // CONFIRM: this clip is the content, not an ad. That claim needs
        // something to check against, so it needs the pin. v3.2.0 also
        // accepted "duration >= 32s" when unpinned, but a 45s unskippable ad
        // passes that too — and confirmation shortens the resume-confirm
        // window to 1.2s, which is less than a typical ad-pod gap. Unpinned we
        // stay on the 5s window: a real end is then 5s rather than 1.2s late,
        // which is the right way round to be wrong.
        if (!contentConfirmed && progressAccum >= CONFIRM_PROGRESS) {
          if (pin ? pinOk(lastDuration) : (lastDuration >= UNPINNED_CONTENT)) contentConfirmed = true;
        }
      }
      return;
    }

    if (data.event === 'onStateChange') {
      var state = data.info;
      if (typeof state === 'number') lastState = state;
      if (state === 1 || state === 3) {
        // PLAYING / BUFFERING — playback (re)started, so any pending "ended"
        // was a pre-roll ad boundary. Cancel it and forward the live state.
        clearEndTimer();
        if (state === 1) announcedPlaying = true;
        toNative({ kind: 'stateChange', state: state, t: lastTime, d: lastDuration });
      } else if (state === 0) {
        // ENDED — real end or ad boundary. Fast-path only when playback
        // reached the end of the clip we have CONTENT METADATA for: the
        // duration must match the pin taken from initialDelivery before
        // anything played. Without that pin we cannot tell a finished trailer
        // from a finished 45s unskippable ad, so we fall through to the
        // confirm window rather than risk cutting a trailer short — 5s until
        // content confirms (ad pods gap slowly), 1.2s after.
        var reachedEnd = lastDuration > 0 && lastTime >= lastDuration - END_EPS;
        var fastPath = reachedEnd && (
          (pin > 0 && pinOk(lastDuration) && lastTime >= MIN_CONTENT && contentConfirmed) ||
          (pin <= 0 && lastDuration >= UNPINNED_CONTENT)
        );
        if (fastPath) {
          forwardEnded();
        } else {
          clearEndTimer();
          resetEpoch(); // next thing to play (ad or content) measures fresh
          endTimer = setTimeout(forwardEnded, contentConfirmed ? CONFIRM_MS : PRE_CONTENT_CONFIRM_MS);
        }
      } else {
        // PAUSED (2), CUED (5), UNSTARTED (-1) — forward unchanged.
        toNative({ kind: 'stateChange', state: state, t: lastTime, d: lastDuration });
      }
    } else if (data.event === 'onError') {
      toNative({ kind: 'error', code: data.info });
    } else if (data.event === 'onReady') {
      toNative({ kind: 'ready' });
      // v3.4.2: assert the state-event subscription NOW — the one moment
      // proven live (2026-08-16 A/B) to deliver onStateChange/ENDED. The
      // widget drops commands posted before it has booted, and onReady is
      // the player's own "I am initialised" announcement, so this is the
      // earliest safe point. A duplicated subscription would risk duplicate
      // events, so the first event arrival arms a latch; if nothing arrives
      // within 2s of onReady the send was dropped and we retry once.
      subscribeToPlayerEvents();
      setTimeout(function () {
        if (!youtubeEventsSeen) { playerSubscriptionSent = false; subscribeToPlayerEvents(); }
      }, 2000);
    }
  });

  toNative({ kind: 'pageLoaded' });
})();
</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300, must-revalidate',
      'Content-Security-Policy': "frame-ancestors *",
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
