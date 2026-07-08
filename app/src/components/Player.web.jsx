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
 * Falls back to a static iframe embed if the IFrame API can't load.
 */
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
  const durationKeyRef = useRef(null);
  const [apiReady, setApiReady] = useState(false);
  const [apiFailed, setApiFailed] = useState(false);

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

    // Report the active video's real duration (once per key) so the parent's
    // backstop cycle timer matches the trailer length instead of the 90s
    // default — otherwise long trailers would be cut off at 90s.
    const reportDuration = () => {
      const p = playerRef.current;
      if (!p) return;
      try {
        const d = p.getDuration?.();
        const key = lastLoadedKeyRef.current;
        if (d && Number.isFinite(d) && d > 0 && durationKeyRef.current !== key) {
          durationKeyRef.current = key;
          onDurationKnownRef.current?.(d);
        }
      } catch { /* noop */ }
    };

    // Ad-aware end detection: ignore the spurious ENDED that fires when a
    // pre-roll ad finishes; only advance on a genuine end. See endDetection.js.
    const detector = createEndDetector({
      onEnd: () => onEndedRef.current?.(),
      getProgress: () => {
        const pl = playerRef.current;
        if (!pl) return null;
        try {
          const currentTime = pl.getCurrentTime?.();
          const duration = pl.getDuration?.();
          if (Number.isFinite(currentTime) && Number.isFinite(duration)) {
            return { currentTime, duration };
          }
        } catch { /* noop */ }
        return null;
      },
    });
    detectorRef.current = detector;

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
            reportDuration();
            onPlayRef.current?.();
          },
          onStateChange: (e) => {
            if (destroyed) return;
            // Feed EVERY state to the ad-aware detector; it decides when a real
            // end happened and cancels itself when an ad boundary resumes.
            detector.onState(e.data);
            if (e.data === PlayerState.PLAYING) { reportDuration(); onPlayRef.current?.(); }
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
      try { detector.dispose(); } catch { /* noop */ }
      detectorRef.current = null;
      try { player?.destroy?.(); } catch { /* noop */ }
      playerRef.current = null;
      lastLoadedKeyRef.current = null;
      durationKeyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiReady, !!trailer?.youtubeKey]);

  useEffect(() => {
    const key = trailer?.youtubeKey;
    if (!key || !playerRef.current) return;
    if (lastLoadedKeyRef.current === key) return;
    try {
      detectorRef.current?.reset(); // drop any pending end from the previous video
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
