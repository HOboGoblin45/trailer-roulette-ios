import { useEffect, useRef, useState } from 'react';
import { useDismissAnimation } from '../lib/useDismissAnimation.js';

/**
 * Shared overlay behaviour for the six fun modes and the fun-modes sheet.
 *
 * Every one of those surfaces is a full-screen dialog over the app, and every
 * one of them used to behave slightly differently: none announced itself as a
 * dialog, none trapped focus, none answered Escape, and each one unmounted on
 * a hard cut. Written seven times these differences are guaranteed to drift,
 * so they live here once.
 *
 * Usage (a mode — the parent owns the mount, so `open` stays true and the
 * mode plays its own exit before telling the parent it is done):
 *
 *     const { closing, close, dialogProps } = useOverlay({
 *       onClose, label: 'Blind Date',
 *     });
 *     return <div className={`feat feat-blind${closing ? ' is-closing' : ''}`} {...dialogProps}>
 *
 * Usage (a sheet whose parent keeps it mounted and flips a flag):
 *
 *     const { mounted, closing, close, dialogProps } = useOverlay({ open, onClose, label });
 *     if (!mounted) return null;
 *
 * Call `close()` from every dismissal path (close button, backdrop tap,
 * Escape) rather than the parent's `onClose`, so the exit animation always
 * gets its --exit-ms before the panel goes away.
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Visible, focusable descendants of `root`, in DOM order. */
function focusablesIn(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return [];
  let nodes = [];
  try {
    nodes = Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR));
  } catch {
    return [];
  }
  return nodes.filter((el) => {
    if (el.getAttribute('aria-hidden') === 'true') return false;
    if (typeof el.getClientRects !== 'function') return true;
    return el.getClientRects().length > 0;
  });
}

function focusSafely(el) {
  if (!el || typeof el.focus !== 'function') return;
  try {
    el.focus({ preventScroll: true });
  } catch {
    try {
      el.focus();
    } catch {
      /* focus is best-effort; never let it break a dismissal */
    }
  }
}

export function useOverlay({ onClose, label, open = true }) {
  const { mounted, closing, close } = useDismissAnimation(open, onClose);
  const panelRef = useRef(null);
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);

  // Focus moves into the panel on open and goes back to whatever had it once
  // the overlay is really gone (the cleanup runs after useDismissAnimation has
  // finished the exit and the parent has unmounted us).
  useEffect(() => {
    if (!mounted || typeof document === 'undefined') return undefined;
    const previous = document.activeElement;
    const panel = panelRef.current;
    focusSafely(panel);
    return () => {
      if (!previous || typeof previous.focus !== 'function') return;
      if (previous.isConnected === false) return;
      // If something else has taken focus in the meantime — picking a mode
      // from the sheet mounts the mode while the sheet is still leaving —
      // leave it there instead of yanking focus back to the button behind us.
      const active = document.activeElement;
      const stillOurs = !active || active === document.body
        || (panel && typeof panel.contains === 'function' && panel.contains(active));
      if (!stillOurs) return;
      focusSafely(previous);
    };
  }, [mounted]);

  // Escape closes; Tab cycles inside the panel instead of walking the app
  // underneath (which is inert to the eye but was not to the keyboard).
  useEffect(() => {
    if (!mounted || typeof document === 'undefined') return undefined;
    const onKeyDown = (event) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape' || event.key === 'Esc') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = focusablesIn(panel);
      if (items.length === 0) {
        event.preventDefault();
        focusSafely(panel);
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!panel.contains(active)) {
        event.preventDefault();
        focusSafely(event.shiftKey ? last : first);
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        focusSafely(last);
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        focusSafely(first);
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [mounted]);

  return {
    mounted,
    closing,
    close,
    panelRef,
    dialogProps: {
      ref: panelRef,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': label,
      tabIndex: -1,
    },
  };
}

/**
 * Drive a mount transition for a swapped-in stage.
 *
 * The modes change stage constantly (loading -> mystery -> playing -> reveal)
 * and every swap was an instant cut, even in files that already knew the
 * trick: BlindDate deferred an `is-in` class by a frame for its reveal and
 * nowhere else. This returns that same boolean for any stage key, so a panel
 * paints once in its "out" state and then transitions in.
 *
 *     const entered = useStageEnter(stage);
 *     <div className={`blind-card feat-enter${entered ? ' is-in' : ''}`}>
 *
 * The key change resets during render, so the incoming stage never flashes in
 * its finished state first; two frames of rAF then guarantee the browser has
 * painted the start state and has something to animate from.
 */
export function useStageEnter(stageKey) {
  const [entered, setEntered] = useState(false);
  const [seenKey, setSeenKey] = useState(stageKey);
  if (seenKey !== stageKey) {
    setSeenKey(stageKey);
    if (entered) setEntered(false);
  }

  useEffect(() => {
    if (typeof requestAnimationFrame !== 'function') {
      setEntered(true);
      return undefined;
    }
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(first);
      if (second) cancelAnimationFrame(second);
    };
  }, [stageKey]);

  return entered;
}

export default useOverlay;
