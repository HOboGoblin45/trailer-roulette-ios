/**
 * Haptics — Capacitor on native, no-op on web.
 *
 * Three signatures used in the app:
 *   - light:  tap-and-go (next trailer, swipe)
 *   - medium: deliberate action (save to watchlist, skip)
 *   - heavy:  shuffle / big shake-up
 *
 * Calls are fire-and-forget; we don't await them in render paths.
 */
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

const isNative = Capacitor.isNativePlatform();

export function light() {
  if (!isNative) return;
  Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
}

export function medium() {
  if (!isNative) return;
  Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
}

export function heavy() {
  if (!isNative) return;
  Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
}

export function selection() {
  if (!isNative) return;
  Haptics.selectionStart().catch(() => {});
}

export function notify(type = 'SUCCESS') {
  if (!isNative) return;
  // type: SUCCESS | WARNING | ERROR
  Haptics.notification({ type }).catch(() => {});
}
