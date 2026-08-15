import { useEffect, useRef, useState } from 'react';
import { embedUrl } from '../lib/youtube.js';
import { loadYouTubeIframeAPI, PlayerState } from '../lib/ytIframeApi.js';
import { createEndDetector } from '../lib/endDetection.js';

/**
 * Web player — same YouTube IFrame Player API as iOS, so cycle behavior
 * (real onEnded, real duration, in-place loadVideoById) is identical
 * across platforms in dev and prod.
 *
 * Ad-aware end detection (v3.1.0): YouTube fires an onStateChange ENDED (0)
 * when a *pre-roll ad* finishes, before the real trailer plays. Advancing on
 * that raw event cut trailers off after ~15s. We route every state through
 * createEndDetector, which only reports a real end once playback reached the
 * video's true end (or stayed ended without an ad boundary resuming it).
 *
 * Ad-hardened duration + progress (v3.2.0): during a pre-roll ad the IFrame
 * API's getDuration()/getCurrentTime() describe the AD, not the trailer.
 * v3.1.0 sampled the duration at the first PLAYING — i.e. the ad — and locked
 * it in once per video, so the parent's backstop cycle timer could be set to
 * the ad's ~12s length and hard-advance mid-trailer ("stops after ~13s").
 * Now we:
 *   - pin the content duration from metadata BEFORE playback starts
 *     (onReady / pre-PLAYING poll samples), and feed a 1s progress poll into
 *     the end detector (contentConfirmed, dual confirm windows, pinned
 *     fast-path — see endDetection.js);
 *   - only report a duration to the parent when it's the pinned metadata or
 *     the detector has confirmed content is actually playing, latest value
 *     wins — an ad's duration can no longer poison the backstop timer.
 *
 * Falls back to a static iframe embed if the IFrame API can't load.
 */
// How long after onReady a duration is still treated as the cued video's
// metadata. A cued player reports its duration within a few hundred ms; past
// this, anything new is an ad's.
const PIN_WINDOW_MS = 2500;

export default function PlayerWeb({
  trailer,
  isPlaying,
  muted = false,
  onPlay,
  onPause,
  onEnded,
  onDurationKnown,
}) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const lastLoadedKeyRef = useRef(null);
  const detectorRef = useRef(null);
  const pendingPinRef = useRef(true); // true until the current video's content duration is pinned
  const pinDeadlineRef = useRef(0); // metadata must arrive by here, else run unpinned
  const lastReportedDurationRef = useRef(0);
  const [apiReady, setApiReady] = useState(false);
  const [apiFailed, setApiFailed] = useState(false);

  // Launch autoplay flips `isPlaying` while the IFrame player is still being
  // constructed, so the [isPlaying] effect below runs against a null
  // playerRef and is never re-run (the flag does not change again). onReady
  // reads the latest intent from here and honours it — without this, the app
  // autoplays on iOS and sits paused on web.
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  const onPlayRef = useRef(onPlay);
  const onPauseRef = useRef(onPause);
  const onEndedRef = useRef(onEnded);
  const onDurationKnownRef = useRef(onDurationKnown);
  useEffect(() => { onPlayRef.current = onPlay; }, [onPlay]);
  useEffect(() => { onPauseRef.current = onPause; }, [onPause]);
  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);
  useEffect(() => { onDurationKnownRef.current = onDurationKnown; }, [onDurationKnown]);

  useEffect(() => {
    let cancelled = false;
    loadYouTubeIframeAPI()
      .then(() => { if (!cancelled) setApiReady(true); })
      .catch(() => { if (!cancelled) setApiFailed(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!apiReady || !trailer?.youtubeKey || !containerRef.current) return;
    if (playerRef.current) return;
    const YT = window.YT;
    let destroyed = false;
    let player;
    let pollTimer = null;

    const readPlayback = () => {
      const pl = playerRef.current;
      if (!pl) return null;
      try {
        const currentTime = pl.getCurrentTime?.();
        const duration = pl.getDuration?.();
        const state = pl.getPlayerState?.();
        if (Number.isFinite(currentTime) && Number.isFinite(duration)) {
          return { currentTime, duration, state };
        }
      } catch { /* noop */ }
      return null;
    };

    // Report a trusted CONTENT duration (once per distinct value) so the
    // parent's backstop cycle timer matches the trailer length instead of the
    // 90s default — without ever trusting an ad's duration.
    const reportTrustedDuration = (d) => {
      if (!Number.isFinite(d) || d <= 0) return;
      if (Math.abs(d - lastReportedDurationRef.current) <= 2) return;
      lastReportedDurationRef.current = d;
      onDurationKnownRef.current?.(d);
    };

    // Pin the content's duration from metadata BEFORE playback starts.
    //
    // v3.2.0 only refused to pin while the player reported PLAYING — but the
    // ad variants behind this bug never report PLAYING, so a later poll could
    // read the AD's duration and pin that as the content's. A wrong pin is
    // worse than no pin: it makes the ad look like the trailer, which lets the
    // ad's own end fast-path a false advance. So we also require an untouched
    // playhead, and stop trying shortly after onReady — by then a cued video
    // has long since reported its metadata, and anything still arriving is an
    // ad's.
    const tryPin = () => {
      if (!pendingPinRef.current) return;
      if (pinDeadlineRef.current && Date.now() > pinDeadlineRef.current) {
        pendingPinRef.current = false; // metadata never arrived — run unpinned
        return;
      }
      const p = readPlayback();
      if (!p || !(p.duration > 0)) return;
      if (p.state === PlayerState.PLAYING || p.state === PlayerState.BUFFERING) return;
      if (!(p.currentTime <= 0.5)) return; // something has played — not metadata
      pendingPinRef.current = false;
      detectorRef.current?.setPinnedDuration(p.duration);
      reportTrustedDuration(p.duration);
    };

    // Ad-aware end detection: ignore the spurious ENDED that fires when a
    // pre-roll ad finishes; only advance on a genuine end. See endDetection.js.
    const detector = createEndDetector({
      onEnd: () => onEndedRef.current?.(),
      getProgress: () => {
        const p = readPlayback();
        return p ? { currentTime: p.currentTime, duration: p.duration } : null;
      },
    });
    detectorRef.current = detector;

    // 1s playback poll: pins the duration when possible, feeds the detector's
    // content-confirmation logic, and upgrades the parent's backstop timer the
    // moment the real trailer is confirmed playing.
    const startPoll = () => {
      if (pollTimer) return;
      pollTimer = setInterval(() => {
        if (destroyed) return;
        tryPin();
        const p = readPlayback();
        if (!p) return;
        detector.onProgress(p.currentTime, p.duration);
        if (detector.isContentConfirmed()) reportTrustedDuration(p.duration);
      }, 1000);
    };

    try {
      player = new YT.Player(containerRef.current, {
        videoId: trailer.youtubeKey,
        playerVars: {
          autoplay: 1,
          playsinline: 1,
          mute: muted ? 1 : 0,
          rel: 0,
          modestbranding: 1,
          controls: 1,
          enablejsapi: 1,
          // Always set a real origin — required for the IFrame API to talk
          // back to the parent across the cross-origin boundary.
          origin: window.location.origin,
        },
        events: {
          onReady: (e) => {
            if (destroyed) return;
            playerRef.current = e.target;
            lastLoadedKeyRef.current = trailer.youtubeKey;
            pinDeadlineRef.current = Date.now() + PIN_WINDOW_MS;
            tryPin();
            startPoll();
            // Catch up on a play intent that arrived before the player
            // existed (launch autoplay). playerVars.autoplay covers the
            // common case, but browsers refuse unmuted autoplay, so the
            // explicit call is what actually starts the trailer.
            if (isPlayingRef.current) {
              try { e.target.playVideo?.(); } catch { /* noop */ }
            }
            onPlayRef.current?.();
          },
          onStateChange: (e) => {
            if (destroyed) return;
            // Feed EVERY state to the ad-aware detector; it decides when a real
            // end happened and cancels itself when an ad boundary resumes.
            detector.onState(e.data);
            if (e.data === PlayerState.PLAYING) { onPlayRef.current?.(); }
            else if (e.data === PlayerState.PAUSED) onPauseRef.current?.();
          },
          onError: (e) => {
            // 2=invalid id, 5=HTML5 player error, 100=not found,
            // 101/150/152=embedding disabled. All are dead ends for this key:
            // skip it and blocklist so it can't resurface this session (parity
            // with the native player). Use the currently-loaded key, not the
            // closure's original — this handler outlives loadVideoById swaps.
            if ([2, 5, 100, 101, 150, 152].includes(e.data)) {
              onEndedRef.current?.({ unplayable: true, youtubeKey: lastLoadedKeyRef.current });
            }
          },
        },
      });
    } catch {
      setApiFailed(true);
    }
    return () => {
      destroyed = true;
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      try { detector.dispose(); } catch { /* noop */ }
      detectorRef.current = null;
      try { player?.destroy?.(); } catch { /* noop */ }
      playerRef.current = null;
      lastLoadedKeyRef.current = null;
      pendingPinRef.current = true;
      pinDeadlineRef.current = 0;
      lastReportedDurationRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiReady, !!trailer?.youtubeKey]);

  useEffect(() => {
    const key = trailer?.youtubeKey;
    if (!key || !playerRef.current) return;
    if (lastLoadedKeyRef.current === key) return;
    try {
      detectorRef.current?.reset(); // drop pending end + pin from the previous video
      pendingPinRef.current = true; // re-pin the new video's metadata duration
      pinDeadlineRef.current = Date.now() + PIN_WINDOW_MS;
      lastReportedDurationRef.current = 0;
      playerRef.current.loadVideoById(key);
      lastLoadedKeyRef.current = key;
    } catch { /* noop */ }
  }, [trailer?.youtubeKey]);

  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    try {
      if (isPlaying) p.playVideo?.();
      else p.pauseVideo?.();
    } catch { /* noop */ }
  }, [isPlaying]);

  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    try { if (muted) p.mute?.(); else p.unMute?.(); } catch { /* noop */ }
  }, [muted]);

  if (!trailer?.youtubeKey) {
    return (
      <div className="player player-empty" aria-busy="true">
        <div className="player-spinner" />
      </div>
    );
  }

  if (apiFailed) {
    return (
      <div className="player player-web">
        <iframe
          key={trailer.youtubeKey}
          title={trailer.title || 'Trailer'}
          src={embedUrl(trailer.youtubeKey, { autoplay: isPlaying, mute: muted })}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div className="player player-web">
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
