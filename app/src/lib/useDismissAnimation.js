import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Play an exit animation before unmounting an overlay.
 *
 * Every sheet and full-screen panel in this app animated IN and then vanished
 * OUT — `if (!open) return null` unmounts on the same frame the user taps
 * close, so the entrance spring is followed by a hard cut. That reads as a
 * bug even to people who could not tell you why, and it contradicts the
 * design rule this app sets for itself in styles/index.css: "nothing fades
 * without moving".
 *
 * The contract, so every overlay closes the same way:
 *
 *   const { mounted, closing, close } = useDismissAnimation(open, onClose);
 *   if (!mounted) return null;
 *   return <div className={`fun-backdrop${closing ? ' is-closing' : ''}`}>...
 *
 * CSS supplies `.is-closing` variants that reverse the entrance keyframes and
 * finish within EXIT_MS. Call `close()` from every dismissal path (close
 * button, backdrop tap, Escape, selecting an item) instead of calling the
 * parent's `onClose` directly.
 *
 * Guarantees:
 *   - `close()` is idempotent; a double tap cannot fire `onClose` twice.
 *   - The parent's `onClose` fires only after the exit animation, so parent
 *     state (and any focus restoration) lands when the overlay is really gone.
 *   - If the parent flips `open` to false itself, the exit still plays.
 *   - Reduce Motion users skip the wait entirely rather than sitting through
 *     an animation they have asked not to see.
 *   - The timer is always cleared on unmount, so a sheet closed while its
 *     parent is unmounting cannot call `onClose` on a dead component.
 */

/** Keep in sync with the `.is-closing` animation durations in CSS. */
export const EXIT_MS = 240;

function prefersReducedMotion() {
  try {
    return typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function useDismissAnimation(open, onClose, exitMs = EXIT_MS) {
  const [mounted, setMounted] = useState(!!open);
  const [closing, setClosing] = useState(false);
  const timerRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => clearTimer, []);

  // Opening (re)mounts immediately and cancels any exit in flight, so a
  // rapid close-then-open cannot leave the overlay stuck in `closing`.
  useEffect(() => {
    if (open) {
      clearTimer();
      setClosing(false);
      setMounted(true);
    }
  }, [open]);

  const finish = useCallback(() => {
    clearTimer();
    setClosing(false);
    setMounted(false);
    onCloseRef.current?.();
  }, []);

  const close = useCallback(() => {
    if (timerRef.current !== null) return; // already leaving
    if (prefersReducedMotion() || exitMs <= 0) {
      finish();
      return;
    }
    setClosing(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      finish();
    }, exitMs);
  }, [exitMs, finish]);

  // The parent closed us directly (state change rather than a tap). Play the
  // same exit rather than snapping out.
  useEffect(() => {
    if (!open && mounted && !closing && timerRef.current === null) {
      close();
    }
  }, [open, mounted, closing, close]);

  return { mounted, closing, close };
}

export default useDismissAnimation;
