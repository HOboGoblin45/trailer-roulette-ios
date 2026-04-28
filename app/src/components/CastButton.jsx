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
      {/* Simple AirPlay glyph; replace with SVG asset in v1.1 */}
      ⟀
    </button>
  );
}
