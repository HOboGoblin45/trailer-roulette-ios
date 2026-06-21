import { useState } from 'react';
import { set, KEYS } from '../lib/storage.js';
import * as haptics from '../lib/haptics.js';

/**
 * First-run onboarding (v1.3.0).
 *
 * Three cards. Skippable. Mounted by App.jsx when ONBOARDED is falsy and
 * unmounted on completion. We don't gate the trailer queue behind this —
 * the user can swipe past in two seconds if they want.
 *
 * Why bother? Apple's Design guidelines (4.0) reward apps that introduce
 * their unique UX patterns to first-time users. Trailer Roulette has two
 * non-obvious gestures (swipe right = seen it, swipe left = skip it) and
 * a private taste profile that gets stronger with use; surfacing those up
 * front improves both review odds and 7-day retention.
 */
const CARDS = [
  {
    title: 'Every era of cinema, shuffled.',
    body: 'Trailer Roulette spins through movie trailers from every decade — timeless classics and brand-new releases alike. Use the Era and decade filters any time to dial in exactly what you\'re in the mood for.',
    icon: '🔀',
  },
  {
    title: 'Swipe to teach the shuffle.',
    body: 'Swipe right when you\'ve seen it (or loved it), left when you didn\'t. The more you swipe, the more the queue tilts toward what you actually love. Your taste profile lives on this phone — nowhere else.',
    icon: '↔',
  },
  {
    title: 'Save the keepers.',
    body: 'Tap the heart on any trailer to save the movie to your Watchlist. No accounts, no tracking — your list, your phone, your business.',
    icon: '♡',
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
        background: 'rgba(14, 23, 38, 0.96)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        color: '#FFFEF8',
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
          color: '#FFFEF8',
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
          color: '#D4AF37',
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
          opacity: 0.85,
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
              background: i === step ? '#D4AF37' : 'rgba(255, 254, 248, 0.3)',
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
