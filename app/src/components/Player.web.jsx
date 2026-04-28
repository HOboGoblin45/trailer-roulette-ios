import { useEffect } from 'react';
import { embedUrl } from '../lib/youtube.js';

/**
 * Web player — official YouTube embed, unmodified.
 * The auto-advance is driven by the cycle timer in TrailerRoulette, not by
 * listening to the iframe API, so the implementation stays simple.
 */
export default function PlayerWeb({ trailer, isPlaying, onPlay, onPause }) {
  // Auto-mark playing when a trailer is loaded (mute=true so autoplay is allowed).
  useEffect(() => {
    if (trailer?.youtubeKey) onPlay?.();
    return () => onPause?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trailer?.youtubeKey]);

  if (!trailer?.youtubeKey) {
    return (
      <div className="player player-empty" aria-busy="true">
        <div className="player-spinner" />
      </div>
    );
  }

  return (
    <div className="player player-web">
      <iframe
        title={trailer.title}
        src={embedUrl(trailer.youtubeKey, { autoplay: isPlaying, mute: false })}
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  );
}
