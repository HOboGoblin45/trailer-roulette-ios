/**
 * Share — Capacitor Share on native, Web Share API / clipboard on web.
 * Fire-and-forget; a cancelled share is not an error.
 */
import { Capacitor } from '@capacitor/core';
import { watchUrl } from './youtube.js';

const isNative = Capacitor.isNativePlatform();

export async function shareTrailer({ title, youtubeKey } = {}) {
  if (!youtubeKey) return { shared: false };
  const url = watchUrl(youtubeKey);
  const text = title ? `Check out the trailer for ${title}` : 'Check out this movie trailer';
  try {
    if (isNative) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: title || 'Trailer', text, url, dialogTitle: 'Share trailer' });
      return { shared: true };
    }
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share({ title: title || 'Trailer', text, url });
      return { shared: true };
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      return { shared: true, copied: true };
    }
  } catch (e) {
    return { shared: false, error: e?.message || String(e) };
  }
  return { shared: false };
}
