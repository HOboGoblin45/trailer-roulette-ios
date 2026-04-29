import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { backdropUrl, posterUrl } from '../lib/tmdb.js';
import { embedUrl } from '../lib/youtube.js';
import { loadYouTubeIframeAPI, PlayerState } from '../lib/ytIframeApi.js';
import * as haptics from '../lib/haptics.js';

/**
 * iOS player (v1.3.1).
 *
 * Capacitor's WKWebView serves the app from a custom URL scheme
 * (`app.trailerroulette://localhost` per `capacitor.config.ts`). The YouTube
 * IFrame Player API does an origin-validation handshake during init, and
 * any non-https / non-http origin trips its preflight and returns
 * **error 153 — "Video player configuration error"**.
 *
 * The static `<iframe src="https://www.youtube-nocookie.com/embed/...">`
 * path doesn't do that validation — YouTube just renders the player. We
 * already had that path as the fallback for "API failed to load"; v1.3.1
 * promotes it to the *primary* path on iOS.
 *
 * Trade-off: we lose real `onEnded` events on iOS, so auto-advance falls
 * back to the parent's cycle timer (still 90s default, or whatever
 * `cycleSeconds` is set to). On web, the API works normally and we keep
 * end-of-video detection — see Player.web.jsx.
 *
 * To re-enable the IFrame API on iOS in the future, either:
 *   - change `server.iosScheme` in capacitor.config.ts to `https` (might
 *     have side effects on Preferences / cookies / file:// resolution), or
 *   - run a tiny postMessage protocol against a static iframe yourself
 *     (replicates the API's onStateChange without origin validation).
 */
const IS_IOS_CAPACITOR =
  Capacitor.getPlatform() === 'ios' && Capacitor.isNativePlatform();

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
  // On iOS Capacitor we skip the IFrame API entirely. apiFailed=true
  // forces the render path into the static-iframe branch.
  const [apiReady, setApiReady] = useState(false);
  const [apiFailed, setApiFailed] = useState(IS_IOS_CAPACITOR);
  const [error, setError] = useState(null);

  // Stable callback refs.
  const onPlayRef = useRef(onPlay);
  const onPauseRef = useRef(onPause);
  const onEndedRef = useRef(onEnded);
  const onDurationKnownRef = useRef(onDurationKnown);
  useEffect(() => { onPlayRef.current = onPlay; }, [onPlay]);
  useEffect(() => { onPauseRef.current = onPause; }, [onPause]);
  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);
  useEffect(() => { onDurationKnownRef.current = onDurationKnown; }, [onDurationKnown]);

  // Load the IFrame API once — only on web. On iOS Capacitor we
  // shortcut to the static iframe and skip this entirely.
  useEffect(() => {
    if (IS_IOS_CAPACITOR) return undefined;
    let cancelled = false;
    loadYouTubeIframeAPI()
      .then(() => { if (!cancelled) setApiReady(true); })
      .catch(() => { if (!cancelled) setApiFailed(true); });
    return () => { cancelled = true; };
  }, []);

  // Create the player as soon as we have an API and a first key (web only).
  useEffect(() => {
    if (IS_IOS_CAPACITOR) return undefined;
    if (!apiReady || !trailer?.youtubeKey || !containerRef.current) return undefined;
    if (playerRef.current) return undefined;

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
            // 100/101/150 → embed disallowed / not found, just skip.
            // Anything else: surface error and skip after a beat so the
            // user isn't stuck on a broken trailer.
            const code = e.data;
            if (code === 100 || code === 101 || code === 150) {
              onEndedRef.current?.();
            } else {
              setError(`YouTube player error ${code}`);
              setTimeout(() => onEndedRef.current?.(), 2000);
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

  // When key changes, swap the video in-place (web only).
  useEffect(() => {
    if (IS_IOS_CAPACITOR) return;
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

  // Honour external isPlaying flips on web (background pause via the
  // static iframe path uses a different mechanism — see iframe `key`).
  useEffect(() => {
    if (IS_IOS_CAPACITOR) return;
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

  // Static-iframe path. Used on iOS Capacitor (always) and on web when
  // the IFrame API failed to load. No origin validation, no plugin
  // surface, just YouTube's official embed via the URL they prescribe.
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
          onLoad={() => {
            haptics.light();
            onPlay?.();
          }}
        />
      </div>
    );
  }

  // Web normal path: API-managed player.
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
