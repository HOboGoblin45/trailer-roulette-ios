/**
 * AirPlay — uses the local capacitor plugin (app/local-plugins/airplay-plugin/)
 * on iOS, falls back to the existing Cast SDK on web.
 */
import { Capacitor } from '@capacitor/core';
import Airplay from 'airplay-plugin';

const isIOS = Capacitor.getPlatform() === 'ios';

export function isAvailable() {
  return isIOS;
}

export async function presentRoutePicker() {
  if (!isIOS) {
    // Web: defer to existing Cast SDK if injected by host page
    if (window.__cast?.presentPicker) {
      window.__cast.presentPicker();
      return { presented: true, source: 'cast-sdk' };
    }
    return { presented: false, source: 'noop' };
  }
  return Airplay.presentRoutePicker();
}

export async function isAirPlayActive() {
  if (!isIOS) return false;
  const { active } = await Airplay.isAirPlayActive();
  return !!active;
}
