import { useEffect, useRef, useState } from 'react';
import { backdropUrl, posterUrl } from '../lib/tmdb.js';
import { embedUrl } from '../lib/youtube.js';
import { loadYouTubeIframeAPI, PlayerState } from '../lib/ytIframeApi.js';
import * as haptics from '../lib/haptics.js';

/**
 * iOS player — YouTube IFrame Player API (v1.2.0).
 *
 * Upgrades over v1.1.0's static iframe:
 *   - Real `onEnded` events let TrailerRoulette advance the moment the
 *     trailer actually finishes, not when the 90s cycle timer expires.
 *   - `loadVideoById` swaps videos in-place — no iframe remount, no flash
 *     of black, no re-handshake with YouTube.
 *   - Real `onReady` lets us fire a haptic the moment playback starts,
 *     and lets us call `getDuration()` to surface the real trailer length.
 *
 * Falls back to a plain iframe embed if the IFrame API fails to load
 * (rare — only on offline first-launch). The fallback path matches
 * v1.1.0 behaviour so we don't lose ground.
 */
export default function PlayerIOS({
  trailer,
  isPlaying,
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
  const [error, setError] = useState(null);

  // Stable callback refs so the "create player" effect can run once
  // without resubscribing whenever the parent re-renders.
  const onPlayRef = useRef(onPlay);
  const onPauseRef = useRef(onPause);
  const onEndedRef = useRef(onEnded);
  const onDurationKnownRef = useRef(onDurationKnown);
  useEffect(() => { onPlayRef.current = onPlay; }, [onPlay]);
  useEffect(() => { onPauseRef.current = onPause; }, [onPause]);
  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);
  useEffect(() => { onDurationKnownRef.current = onDurationKnown; }, [onDurationKnown]);

  // Load the IFrame API once.
  useEffect(() => {
    let cancelled = false;
    loadYouTubeIframeAPI()
      .then(() => { if (!cancelled) setApiReady(true); })
      .catch(() => { if (!cancelled) setApiFailed(true); });
    return () => { cancelled = true; };
  }, []);

  // Create the player as soon as we have an API and a first key.
  useEffect(() => {
    if (!apiReady || !trailer?.youtubeKey || !containerRef.current) return;
    if (playerRef.current) return; // already created

    const YT = window.YT;
    let destroyed = false;
    let player;

    try {
      player = new YT.Player(containerRef.current, {
        videoId: trailer.youtubeKey,
        playerVars: {
          autoplay: 1,
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          controls: 1,
          enablejsapi: 1,
          // origin helps YT's CSRF protection accept our postMessages even
          // when the WKWebView is served from the capacitor:// scheme.
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
            } catch { /* duration is optional */ }
            haptics.light();
            onPlayRef.current?.();
          },
          onStateChange: (e) => {
            if (destroyed) return;
            if (e.data === PlayerState.ENDED) onEndedRef.current?.();
            else if (e.data === PlayerState.PLAYING) onPlayRef.current?.();
            else if (e.data === PlayerState.PAUSED) onPauseRef.current?.();
          },
          onError: (e) => {
            // Codes: 2 invalid id, 5 HTML5 player error, 100 not found,
            // 101/150 embedding disallowed. For 100/101/150 we should skip
            // since the trailer isn't playable in an embed.
            const code = e.data;
            if (code === 100 || code === 101 || code === 150) {
              onEndedRef.current?.();
            } else {
              setError(`YouTube player error ${code}`);
            }
          },
        },
      });
    } catch (e) {
      setError(`Player init failed: ${e?.message || e}`);
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

  // When key changes, swap the video in-place (no remount).
  useEffect(() => {
    const key = trailer?.youtubeKey;
    if (!key || !playerRef.current) return;
    if (lastLoadedKeyRef.current === key) return;
    try {
      playerRef.current.loadVideoById(key);
      lastLoadedKeyRef.current = key;
      setError(null);
    } catch (e) {
      setError(`loadVideoById failed: ${e?.message || e}`);
    }
  }, [trailer?.youtubeKey]);

  // Honour external isPlaying flips (e.g. background pause).
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    try {
      if (isPlaying) p.playVideo?.();
      else p.pauseVideo?.();
    } catch { /* noop */ }
  }, [isPlaying]);

  // Loading skeleton.
  if (!trailer) {
    return (
      <div className="player player-empty" aria-busy="true">
        <div className="player-spinner" />
      </div>
    );
  }

  // No trailer available — show poster backdrop with hint.
  if (!trailer.youtubeKey) {
    const bg = backdropUrl(trailer.backdrop_path) || posterUrl(trailer.poster_path);
    return (
      <div className="player player-ios">
        {bg && (
          <div
            className="player-backdrop"
            style={{ backgroundImage: `url("${bg}")` }}
            aria-hidden="true"
          />
        )}
        <p className="player-hint">No trailer available — try shuffle.</p>
      </div>
    );
  }

  // Fallback path: IFrame API failed to load. Use a plain iframe so the
  // app remains functional offline-then-online or behind certain firewalls
  // that block www.youtube.com/iframe_api.
  if (apiFailed) {
    return (
      <div className="player player-ios">
        <iframe
          key={trailer.youtubeKey}
          title={trailer.title || 'Trailer'}
          src={embedUrl(trailer.youtubeKey, { autoplay: true, mute: false })}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          style={{ width: '100%', height: '100%', border: 0, background: '#000' }}
          onLoad={() => onPlay?.()}
        />
      </div>
    );
  }

  // Normal path: API-managed player. The container div is what YT.Player
  // replaces with its own iframe.
  return (
    <div className="player player-ios">
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {error && (
        <div
          role="alert"
          style={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            right: 8,
            background: 'rgba(226, 109, 92, 0.92)',
            color: '#fff',
            padding: 8,
            borderRadius: 4,
            fontSize: 12,
            fontFamily: 'monospace',
            wordBreak: 'break-all',
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
