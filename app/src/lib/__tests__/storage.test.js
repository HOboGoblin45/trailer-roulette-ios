import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the Capacitor modules — must be hoisted before importing storage.
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => false, // Force web/localStorage path in tests
  },
}));

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
    keys: vi.fn(),
  },
}));

// Now safe to import — these will use the mocked Capacitor stubs.
import { get, set, remove, KEYS } from '../storage.js';

describe('storage (web/localStorage path)', () => {
  beforeEach(() => {
    // Fresh localStorage before each test
    if (typeof window === 'undefined') {
      // Node test environment — simulate window.localStorage
      const store = new Map();
      global.window = {
        localStorage: {
          getItem: (k) => store.has(k) ? store.get(k) : null,
          setItem: (k, v) => store.set(k, String(v)),
          removeItem: (k) => store.delete(k),
          key: (i) => Array.from(store.keys())[i],
          get length() { return store.size; },
        },
      };
      // Make Object.keys(window.localStorage) work
      Object.defineProperty(global.window.localStorage, 'keys', {
        value: () => Array.from(store.keys()),
      });
    }
    // Clear any leftover state
    if (global.window?.localStorage) {
      // Simulate clear; our shim doesn't have one but we replace the underlying store
      const store = new Map();
      Object.defineProperty(global.window.localStorage, 'getItem', { value: (k) => store.has(k) ? store.get(k) : null, configurable: true });
      Object.defineProperty(global.window.localStorage, 'setItem', { value: (k, v) => store.set(k, String(v)), configurable: true });
      Object.defineProperty(global.window.localStorage, 'removeItem', { value: (k) => store.delete(k), configurable: true });
    }
  });

  it('round-trips a JSON object', async () => {
    const obj = { foo: 'bar', n: 42, arr: [1, 2, 3] };
    await set('test-key', obj);
    const got = await get('test-key');
    expect(got).toEqual(obj);
  });

  it('returns null for unknown key', async () => {
    const got = await get('does-not-exist');
    expect(got).toBeNull();
  });

  it('removes a key', async () => {
    await set('to-remove', 'hello');
    expect(await get('to-remove')).toBe('hello');
    await remove('to-remove');
    expect(await get('to-remove')).toBeNull();
  });

  it('handles arrays', async () => {
    const arr = [{ id: 1 }, { id: 2 }];
    await set('arr-key', arr);
    expect(await get('arr-key')).toEqual(arr);
  });

  it('handles primitives', async () => {
    await set('str', 'hello');
    expect(await get('str')).toBe('hello');
    await set('num', 42);
    expect(await get('num')).toBe(42);
    await set('bool', true);
    expect(await get('bool')).toBe(true);
  });

  it('returns the raw string if JSON.parse fails', async () => {
    // Manually inject a malformed value
    global.window.localStorage.setItem('malformed', 'not-json {');
    const got = await get('malformed');
    expect(got).toBe('not-json {');
  });
});

describe('KEYS', () => {
  it('exposes all the well-known storage keys', () => {
    expect(KEYS.WATCHLIST).toBe('trailer-roulette.watchlist');
    expect(KEYS.ONBOARDED).toBe('trailer-roulette.onboarded');
    expect(KEYS.ERROR_LOG).toBe('trailer-roulette.error-log');
  });

  it('is frozen (cannot be mutated at runtime)', () => {
    expect(() => { KEYS.WATCHLIST = 'mutated'; }).toThrow();
  });

  it('uses the trailer-roulette namespace consistently', () => {
    Object.values(KEYS).forEach((v) => {
      expect(v).toMatch(/^trailer-roulette\./);
    });
  });
});
