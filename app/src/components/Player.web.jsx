import { useEffect, useRef, useState } from 'react';
import { embedUrl } from '../lib/youtube.js';
import { loadYouTubeIframeAPI, PlayerState } from '../lib/ytIframeApi.js';

/**
 * Web player — same YouTube IFrame Player API as iOS, so cycle behavior
 * (real onEnded, real duration, in-place loadVideoById) is identical
 * across platforms in dev and prod.
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
            try {
              const d = e.target.getDuration();
              if (d && Number.isFinite(d)) onDurationKnownRef.current?.(d);
            } catch { /* noop */ }
            onPlayRef.current?.();
          },
          onStateChange: (e) => {
            if (destroyed) return;
            if (e.data === PlayerState.ENDED) onEndedRef.current?.();
            else if (e.data === PlayerState.PLAYING) onPlayRef.current?.();
            else if (e.data === PlayerState.PAUSED) onPauseRef.current?.();
          },
          onError: (e) => {
            if ([100, 101, 150, 152].includes(e.data)) onEndedRef.current?.();
          },
        },
      });
    } catch {
      setApiFailed(true);
    }
    return () => {
      destroyed = true;
      try { player?.destroy?.(); } catch { /* noop */ }
      playerRef.current = null;
      lastLoadedKeyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiReady, !!trailer?.youtubeKey]);

  useEffect(() => {
    const key = trailer?.youtubeKey;
    if (!key || !playerRef.current) return;
    if (lastLoadedKeyRef.current === key) return;
    try {
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
