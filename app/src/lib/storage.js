/**
 * Storage abstraction — Capacitor Preferences on native, localStorage on web.
 *
 * All app state (watchlist, taste profile, settings) flows through here.
 * No PII, no analytics, no remote sync.
 */
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const isNative = Capacitor.isNativePlatform();

export async function get(key) {
  if (isNative) {
    const { value } = await Preferences.get({ key });
    return value ? safeParse(value) : null;
  }
  const raw = window.localStorage.getItem(key);
  return raw ? safeParse(raw) : null;
}

export async function set(key, value) {
  const json = JSON.stringify(value);
  if (isNative) {
    await Preferences.set({ key, value: json });
    return;
  }
  window.localStorage.setItem(key, json);
}

export async function remove(key) {
  if (isNative) {
    await Preferences.remove({ key });
    return;
  }
  window.localStorage.removeItem(key);
}

export async function keys() {
  if (isNative) {
    const { keys } = await Preferences.keys();
    return keys;
  }
  return Object.keys(window.localStorage);
}

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export const KEYS = Object.freeze({
  WATCHLIST: 'trailer-roulette.watchlist',
  ONBOARDED: 'trailer-roulette.onboarded',
  ERROR_LOG: 'trailer-roulette.error-log',
});
