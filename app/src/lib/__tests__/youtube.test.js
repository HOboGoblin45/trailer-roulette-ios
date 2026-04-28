import { describe, it, expect } from 'vitest';
import { watchUrl, embedUrl } from '../youtube.js';

describe('watchUrl', () => {
  it('returns canonical YouTube watch URL', () => {
    expect(watchUrl('abc123')).toBe('https://www.youtube.com/watch?v=abc123');
  });

  it('encodes special characters in the key', () => {
    // Real YouTube IDs are alphanumeric + - and _, but the helper should be safe
    expect(watchUrl('abc def')).toBe('https://www.youtube.com/watch?v=abc%20def');
  });
});

describe('embedUrl', () => {
  it('uses youtube-nocookie domain by default', () => {
    const url = embedUrl('abc123');
    expect(url.startsWith('https://www.youtube-nocookie.com/embed/abc123')).toBe(true);
  });

  it('sets autoplay=1 when autoplay is true (default)', () => {
    const url = new URL(embedUrl('abc123'));
    expect(url.searchParams.get('autoplay')).toBe('1');
  });

  it('sets autoplay=0 when autoplay is false', () => {
    const url = new URL(embedUrl('abc123', { autoplay: false }));
    expect(url.searchParams.get('autoplay')).toBe('0');
  });

  it('sets mute=1 when mute is true', () => {
    const url = new URL(embedUrl('abc123', { mute: true }));
    expect(url.searchParams.get('mute')).toBe('1');
  });

  it('always sets rel=0 (no related videos)', () => {
    const url = new URL(embedUrl('abc123'));
    expect(url.searchParams.get('rel')).toBe('0');
  });

  it('always sets playsinline=1 (iOS critical)', () => {
    const url = new URL(embedUrl('abc123'));
    expect(url.searchParams.get('playsinline')).toBe('1');
  });

  it('always sets modestbranding=1', () => {
    const url = new URL(embedUrl('abc123'));
    expect(url.searchParams.get('modestbranding')).toBe('1');
  });
});
