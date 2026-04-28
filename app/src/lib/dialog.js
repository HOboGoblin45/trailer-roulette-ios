/**
 * Dialog wrapper — Capacitor Dialog on native, window.alert/confirm on web.
 * Replace every alert()/confirm() in the app with these.
 */
import { Capacitor } from '@capacitor/core';
import { Dialog } from '@capacitor/dialog';

const isNative = Capacitor.isNativePlatform();

export async function alert(message, title = 'Trailer Roulette') {
  if (isNative) {
    await Dialog.alert({ title, message });
    return;
  }
  window.alert(message);
}

export async function confirm(message, title = 'Trailer Roulette') {
  if (isNative) {
    const { value } = await Dialog.confirm({ title, message });
    return value;
  }
  return window.confirm(message);
}

export async function prompt(message, defaultValue = '', title = 'Trailer Roulette') {
  if (isNative) {
    const { value, cancelled } = await Dialog.prompt({
      title,
      message,
      inputPlaceholder: defaultValue,
    });
    return cancelled ? null : value;
  }
  return window.prompt(message, defaultValue);
}
