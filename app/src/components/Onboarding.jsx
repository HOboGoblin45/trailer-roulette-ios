import { useState } from 'react';
import { set, KEYS } from '../lib/storage.js';
import * as haptics from '../lib/haptics.js';

/**
 * First-run onboarding (v2.4.0).
 *
 * Three short cards. Skippable. Mounted by App.jsx when ONBOARDED is falsy
 * and unmounted on completion — nothing gates the trailer feed behind it.
 *
 * Copy matches the simplified app: no filters, no accounts. Just a
 * never-ending randomized feed you play, skip, and beam to your TV.
 */
const CARDS = [
  {
    title: 'Every movie trailer. Shuffled.',
    body: 'A never-ending, randomized feed of trailers from every era of cinema — timeless classics and brand-new releases alike. Tap play and go.',
    icon: '🎬',
  },
  {
    title: 'Skip freely. Beam to your TV.',
    body: 'Tap Skip (or swipe) to jump to the next trailer instantly. Tap AirPlay to send the whole feed to your TV — no menus in the way.',
    icon: '📺',
  },
  {
    title: 'Save the keepers.',
    body: 'Tap the heart to save any movie to your Watchlist. No account, no tracking — it all lives on this phone.',
    icon: '♥',
  },
];

export default function Onboarding({ onDone }) {
  const [step, setStep] = useState(0);

  const finish = async () => {
    haptics.medium();
    try { await set(KEYS.ONBOARDED, true); } catch { /* noop */ }
    onDone?.();
  };

  const next = () => {
    haptics.light();
    if (step >= CARDS.length - 1) finish();
    else setStep(step + 1);
  };

  const card = CARDS[step];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'radial-gradient(120% 90% at 50% 0%, #14161C 0%, #07080B 70%)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        color: '#F5F6F8',
      }}
    >
      {/* Skip button — top-right. */}
      <button
        onClick={finish}
        aria-label="Skip onboarding"
        style={{
          position: 'absolute',
          top: 'max(env(safe-area-inset-top), 16px)',
          right: 16,
          background: 'transparent',
          color: '#F5F6F8',
          border: 'none',
          padding: 12,
          fontSize: 14,
          opacity: 0.7,
          cursor: 'pointer',
        }}
      >
        Skip
      </button>

      {/* Icon */}
      <div
        aria-hidden="true"
        style={{
          fontSize: 64,
          marginBottom: 24,
          lineHeight: 1,
        }}
      >
        {card.icon}
      </div>

      <h2
        id="onboarding-title"
        style={{
          fontSize: 24,
          fontWeight: 700,
          textAlign: 'center',
          margin: '0 0 16px 0',
          maxWidth: 400,
        }}
      >
        {card.title}
      </h2>
      <p
        style={{
          fontSize: 16,
          lineHeight: 1.5,
          textAlign: 'center',
          opacity: 0.7,
          margin: '0 0 40px 0',
          maxWidth: 380,
        }}
      >
        {card.body}
      </p>

      {/* Step dots */}
      <div
        aria-hidden="true"
        style={{ display: 'flex', gap: 8, marginBottom: 32 }}
      >
        {CARDS.map((_, i) => (
          <span
            key={i}
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: i === step ? 'var(--gold, #3DA5F4)' : 'rgba(255, 255, 255, 0.25)',
              transition: 'background 200ms ease',
            }}
          />
        ))}
      </div>

      <button className="onboarding-button" onClick={next}>
        {step >= CARDS.length - 1 ? "Let's go" : 'Next'}
      </button>
    </div>
  );
}
