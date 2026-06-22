/**
 * errorLog — a tiny, on-device crash/error recorder.
 *
 * There's no backend and no remote analytics (by design — nothing about the
 * user leaves the phone). But "runs no matter what" still benefits from being
 * able to see what went wrong, so we keep a capped ring buffer of the last few
 * errors in local storage. It's surfaced read-only in the About screen.
 *
 * The logger itself must never throw — it's the last line of defense.
 */
import { get, set, KEYS } from './storage.js';

const MAX = 25;
let buffer = [];
let started = false;

export function recordError(kind, message, stack) {
  try {
    const entry = {
      t: new Date().toISOString(),
      kind,
      message: String(message || '').slice(0, 300),
      stack: String(stack || '').slice(0, 800),
    };
    buffer = [entry, ...buffer].slice(0, MAX);
    set(KEYS.ERROR_LOG, buffer).catch(() => {});
  } catch { /* a logger must never throw */ }
}

export async function getErrorLog() {
  try { return (await get(KEYS.ERROR_LOG)) || []; } catch { return []; }
}

export async function clearErrorLog() {
  buffer = [];
  try { await set(KEYS.ERROR_LOG, []); } catch { /* noop */ }
}

/** Hook global error + unhandled-rejection handlers exactly once. */
export function initErrorLog() {
  if (started || typeof window === 'undefined') return;
  started = true;
  get(KEYS.ERROR_LOG).then((v) => { if (Array.isArray(v)) buffer = v; }).catch(() => {});
  window.addEventListener('error', (e) => {
    recordError('error', e?.message, e?.error?.stack);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e?.reason;
    recordError('unhandledrejection', r?.message || r, r?.stack);
  });
}
