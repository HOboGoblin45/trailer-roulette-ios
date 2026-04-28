import { registerPlugin } from '@capacitor/core';

/**
 * AirplayPlugin — JS interface auto-resolved by Capacitor.
 * On iOS, Capacitor binds this to the Swift class. On web/other,
 * the `web` fallback below is used (no-op; falls through to Cast SDK).
 */
const Airplay = registerPlugin('AirplayPlugin', {
  web: {
    presentRoutePicker: async () => ({ presented: false, source: 'web' }),
    isAirPlayActive: async () => ({ active: false }),
  },
});

export default Airplay;
