import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { backdropUrl, posterUrl } from '../lib/tmdb.js';
import { watchUrl } from '../lib/youtube.js';
import * as haptics from '../lib/haptics.js';

/**
 * iOS player (v1.4.1) — visible diagnostics on Play.
 *
 * v1.4.0 attempted SFSafariViewController via @capacitor/browser but
 * reproduced the v1.0.6 "Play does nothing" symptom. Without visibility
 * into what Browser.open actually does on tap, we can't tell whether
 * the plugin is unregistered, the call is throwing, the call is silently
 * resolving without presenting, or the tap isn't even reaching the
 * handler. v1.4.1 surfaces every step under the Play button and adds a
 * three-stage fallback chain (Browser.open → window.open → location.href).
 *
 * The diagnostic strip is not a permanent UI element — once we identify
 * which method works on Charlie's device we'll strip it for v1.4.2.
 */
export default function PlayerIOS({
  trailer,
  isPlaying,
  onPlay,
  onPause,
  onEnded,
}) {
  const browserOpenRef = useRef(false);
  const [opening, setOpening] = useState(false);
  const [debug, setDebug] = useState(() => {
    const platform = Capacitor.getPlatform();
    const native = Capacitor.isNativePlatform();
    const browserAvail = Capacitor.isPluginAvailable
      ? Capacitor.isPluginAvailable('Browser')
      : '?';
    return `boot: platform=${platform} native=${native} Browser=${browserAvail}`;
  });

  const onPauseRef = useRef(onPause);
  const onEndedRef = useRef(onEnded);
  useEffect(() => { onPauseRef.current = onPause; }, [onPause]);
  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);

  // Listen for Safari dismiss → advance to next trailer.
  useEffect(() => {
    let listener;
    let cancelled = false;
    (async () => {
      try {
        listener = await Browser.addListener('browserFinished', () => {
          browserOpenRef.current = false;
          onPauseRef.current?.();
          onEndedRef.current?.();
          setDebug((d) => d + ' | dismissed');
        });
      } catch (e) {
        if (!cancelled) setDebug((d) => d + ` | listener err: ${e?.message || e}`);
      }
    })();
    return () => {
      cancelled = true;
      try { listener?.remove(); } catch { /* noop */ }
    };
  }, []);

  // Close Safari if parent flips isPlaying off (background pause).
  useEffect(() => {
    if (!isPlaying && browserOpenRef.current) {
      Browser.close().catch(() => {});
      browserOpenRef.current = false;
    }
  }, [isPlaying]);

  const handlePlay = async () => {
    // Step 1: confirm tap actually reached us. This is the FIRST thing
    // that should change visibly when the button is pressed. If you tap
    // and the strip still shows "boot:" the click handler isn't firing.
    const stamp = new Date().toISOString().slice(11, 19);
    let line = `tap@${stamp}`;
    setDebug(line);
    haptics.medium();

    const key = trailer?.youtubeKey;
    if (!key) {
      setDebug(line + ' | NO KEY — try shuffle');
      return;
    }
    const url = watchUrl(key);
    line += ` key=${key}`;
    setDebug(line);

    setOpening(true);

    // Method 1: Browser.open (SFSafariViewController). 5-second timeout
    // because in v1.0.6 we suspect the call resolved without presenting,
    // hanging the UI silently.
    try {
      line += ' | Browser.open…';
      setDebug(line);
      const opened = Promise.race([
        Browser.open({ url, presentationStyle: 'fullscreen' }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout 5s')), 5000)),
      ]);
      await opened;
      browserOpenRef.current = true;
      onPlay?.();
      line += ' | OK';
      setDebug(line);
      setOpening(false);
      return;
    } catch (e) {
      line += ` | Browser.open FAIL: ${e?.message || e}`;
      setDebug(line);
      browserOpenRef.current = false;
    }

    // Method 2: window.open. In Capacitor's WKWebView this is intercepted
    // and routed to the system browser (or the Browser plugin if it's
    // registered, which is what we just tried). Worth trying because some
    // builds register the JS API differently than the native bridge.
    try {
      line += ' | window.open…';
      setDebug(line);
      const w = window.open(url, '_blank');
      line += w ? ' | window.open returned ref' : ' | window.open → null';
      setDebug(line);
      if (w) {
        onPlay?.();
        setOpening(false);
        return;
      }
    } catch (e) {
      line += ` | window.open FAIL: ${e?.message || e}`;
      setDebug(line);
    }

    // Method 3: location.href. Last resort — replaces the WKWebView's
    // current page with YouTube. Capacitor *should* intercept the
    // navigation and route it externally, but if it doesn't, the user
    // ends up on YouTube inside the app (recoverable via foreground swipe
    // back, but ugly).
    try {
      line += ' | location.href…';
      setDebug(line);
      // Tiny delay so the user reads the strip before navigation happens.
      setTimeout(() => {
        try { window.location.href = url; } catch (e) {
          setDebug((d) => d + ` | href FAIL: ${e?.message || e}`);
        }
      }, 400);
      onPlay?.();
    } catch (e) {
      line += ` | location.href FAIL: ${e?.message || e}`;
      setDebug(line);
    }

    setOpening(false);
  };

  if (!trailer) {
    return (
      <div className="player player-empty" aria-busy="true">
        <div className="player-spinner" />
      </div>
    );
  }

  const bg = backdropUrl(trailer.backdrop_path) || posterUrl(trailer.poster_path);
  const hasTrailer = Boolean(trailer.youtubeKey);

  return (
    <div className="player player-ios">
      {bg && (
        <div
          className="player-backdrop"
          style={{ backgroundImage: `url("${bg}")` }}
          aria-hidden="true"
        />
      )}

      <button
        className="player-play-button"
        onClick={handlePlay}
        aria-label={hasTrailer ? 'Play trailer' : 'No trailer available'}
        style={{ opacity: hasTrailer ? 1 : 0.5, position: 'relative', zIndex: 5 }}
      >
        <span className="play-icon" aria-hidden="true">▶</span>
        <span className="play-label">
          {opening ? 'Opening…' : (hasTrailer ? 'Play' : 'No trailer')}
        </span>
      </button>

      {/* Visible diagnostic — strip in v1.4.2 once we know what's failing. */}
      <div
        style={{
          position: 'absolute',
          bottom: 4,
          left: 4,
          right: 4,
          background: 'rgba(0,0,0,0.78)',
          color: '#9CFF9C',
          fontFamily: 'monospace',
          fontSize: 10,
          padding: 6,
          borderRadius: 4,
          wordBreak: 'break-all',
          maxHeight: '45%',
          overflowY: 'auto',
          zIndex: 4,
          pointerEvents: 'none', // never blocks the Play button
        }}
      >
        {debug}
      </div>

      {!hasTrailer && (
        <p className="player-hint" style={{ zIndex: 6 }}>
          No trailer available — swipe to skip.
        </p>
      )}
    </div>
  );
}
