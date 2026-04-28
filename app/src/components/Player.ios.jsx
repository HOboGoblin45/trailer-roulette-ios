import { useEffect, useRef, useState } from 'react';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { backdropUrl, posterUrl } from '../lib/tmdb.js';
import { watchUrl } from '../lib/youtube.js';

/**
 * iOS player — SFSafariViewController via @capacitor/browser.
 *
 * v1.0.6: visible diagnostics for the Play tap. We were silently failing
 * (Browser.open throwing, plugin not registered, etc.) and the user just
 * saw "nothing happens." Now every tap shows what happened in a debug
 * line under the Play button, and falls back to window.open if Browser.open
 * fails.
 */
export default function PlayerIOS({ trailer, isPlaying, onPlay, onPause }) {
  const browserOpen = useRef(false);
  const [debug, setDebug] = useState(`platform=${Capacitor.getPlatform()} pluginAvail=${Capacitor.isPluginAvailable ? Capacitor.isPluginAvailable('Browser') : '?'}`);

  // Listen for browser dismiss → mark paused.
  useEffect(() => {
    let subPromise;
    try {
      subPromise = Browser.addListener('browserFinished', () => {
        browserOpen.current = false;
        onPause?.();
      });
    } catch (e) {
      setDebug((d) => d + ` | listener err: ${e.message || e}`);
    }
    return () => {
      try { subPromise?.then?.((s) => s?.remove?.()); } catch {}
    };
  }, [onPause]);

  // If parent flips isPlaying off, close the browser.
  useEffect(() => {
    if (!isPlaying && browserOpen.current) {
      Browser.close().catch(() => {});
      browserOpen.current = false;
    }
  }, [isPlaying]);

  const open = async () => {
    const key = trailer?.youtubeKey;
    const url = key ? watchUrl(key) : null;

    setDebug(`platform=${Capacitor.getPlatform()} key=${key || 'NULL'} url=${url || 'none'}`);

    if (!key || !url) {
      setDebug((d) => d + ' | tap ignored (no key)');
      return;
    }

    onPlay?.();
    browserOpen.current = true;

    // Try Capacitor Browser first
    try {
      setDebug((d) => d + ' | trying Browser.open()');
      await Browser.open({ url, presentationStyle: 'fullscreen' });
      setDebug((d) => d + ' | Browser.open OK');
      return;
    } catch (err) {
      setDebug((d) => d + ` | Browser.open FAILED: ${err?.message || err}`);
      browserOpen.current = false;
    }

    // Fallback: window.open (Capacitor's default catches this and routes natively)
    try {
      setDebug((d) => d + ' | trying window.open()');
      const w = window.open(url, '_blank');
      if (w) {
        setDebug((d) => d + ' | window.open OK');
      } else {
        setDebug((d) => d + ' | window.open returned null');
      }
    } catch (err2) {
      setDebug((d) => d + ` | window.open FAILED: ${err2?.message || err2}`);
    }

    // Final fallback: navigate the WebView itself
    try {
      setDebug((d) => d + ' | falling back to location.href');
      // small delay so the user can read the debug line first
      setTimeout(() => { window.location.href = url; }, 300);
    } catch (err3) {
      setDebug((d) => d + ` | location.href FAILED: ${err3?.message || err3}`);
      onPause?.();
    }
  };

  if (!trailer) {
    return (
      <div className="player player-empty" aria-busy="true">
        <div className="player-spinner" />
      </div>
    );
  }

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
      <button className="player-play-button" onClick={open} aria-label="Play trailer">
        <span className="play-icon">▶</span>
        <span className="play-label">Play</span>
      </button>

      {/* Visible diagnostic — strips when we ship v1.1.0 */}
      <div style={{
        position: 'absolute',
        bottom: 4,
        left: 4,
        right: 4,
        background: 'rgba(0,0,0,0.7)',
        color: '#9CFF9C',
        fontFamily: 'monospace',
        fontSize: 10,
        padding: 4,
        borderRadius: 4,
        wordBreak: 'break-all',
        maxHeight: '40%',
        overflowY: 'auto',
      }}>
        {debug}
      </div>

      {!trailer.youtubeKey && (
        <p className="player-hint">No trailer available — try shuffle.</p>
      )}
    </div>
  );
}
