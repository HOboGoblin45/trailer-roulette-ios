import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import * as airplay from '../lib/airplay.js';
import * as haptics from '../lib/haptics.js';

/**
 * Cast button — AirPlay on iOS via the AVRoutePlugin, Cast SDK on web.
 * The button is always visible; the underlying picker handles "no devices found"
 * messaging natively.
 */
export default function CastButton() {
  const [active, setActive] = useState(false);
  const isIOS = Capacitor.getPlatform() === 'ios';

  useEffect(() => {
    if (!isIOS) return undefined;
    let cancelled = false;
    const tick = async () => {
      const a = await airplay.isAirPlayActive();
      if (!cancelled) setActive(a);
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [isIOS]);

  const onClick = async () => {
    haptics.light();
    await airplay.presentRoutePicker();
  };

  return (
    <button
      className={`control-btn cast-btn ${active ? 'active' : ''}`}
      onClick={onClick}
      aria-label={isIOS ? 'AirPlay' : 'Cast'}
      aria-pressed={active}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" />
        <polygon points="12 15 17 21 7 21 12 15" />
      </svg>
    </button>
  );
}
