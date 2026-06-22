import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';

/**
 * SwipeCard — a Tinder-style draggable card.
 *
 * The card (a full-bleed trailer + its info) follows the finger, rotates, and
 * shows SAVE / SKIP stamps. Release past the threshold and it flings off-screen
 * and fires the matching callback; release short of it and the card springs
 * back. A clean tap (no real drag) calls onTap so the trailer can start playing.
 *
 *   swipe right  → onLike()   (save + advance)
 *   swipe left   → onNope()   (skip + advance)
 *   tap          → onTap()    (play)
 *
 * Buttons elsewhere can trigger the same animated fling via the imperative
 * ref: cardRef.current.fling('like' | 'nope').
 */
const THRESHOLD = 95;     // px past which a release commits the swipe
const TAP_SLOP = 10;      // px of movement still considered a tap
const FLING_MS = 260;     // off-screen animation duration

const SwipeCard = forwardRef(function SwipeCard(
  { children, disabled, onLike, onNope, onTap, resetKey },
  ref
) {
  const [dx, setDx] = useState(0);
  const [animating, setAnimating] = useState(false); // CSS transition on?
  const start = useRef(null);
  const axis = useRef(null);      // 'x' | 'y' once the gesture locks
  const flingTimer = useRef(null);
  const enterKey = useRef(resetKey);

  // New trailer → reset the card to center with a gentle enter animation.
  useEffect(() => {
    clearTimeout(flingTimer.current);
    enterKey.current = resetKey;
    setAnimating(false);
    setDx(0);
  }, [resetKey]);

  useEffect(() => () => clearTimeout(flingTimer.current), []);

  const commit = (dir) => {
    setAnimating(true);
    setDx(dir === 'like' ? window.innerWidth * 1.3 : -window.innerWidth * 1.3);
    clearTimeout(flingTimer.current);
    flingTimer.current = setTimeout(() => {
      if (dir === 'like') onLike?.();
      else onNope?.();
    }, FLING_MS);
  };

  useImperativeHandle(ref, () => ({
    fling: (dir) => { if (!disabled) commit(dir); },
  }), [disabled]); // eslint-disable-line react-hooks/exhaustive-deps

  if (disabled) {
    return <div className="tr-card">{children}</div>;
  }

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    axis.current = null;
    setAnimating(false);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const onPointerMove = (e) => {
    if (!start.current) return;
    const mx = e.clientX - start.current.x;
    const my = e.clientY - start.current.y;
    if (!axis.current && (Math.abs(mx) > 6 || Math.abs(my) > 6)) {
      axis.current = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
    }
    if (axis.current === 'x') setDx(mx);
  };

  const onPointerUp = (e) => {
    if (!start.current) return;
    const mx = e.clientX - start.current.x;
    const my = e.clientY - start.current.y;
    const dt = Date.now() - start.current.t;
    const moved = Math.abs(mx) > TAP_SLOP || Math.abs(my) > TAP_SLOP;
    start.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }

    if (!moved && dt < 350) { setDx(0); onTap?.(); return; }
    if (mx > THRESHOLD) { commit('like'); return; }
    if (mx < -THRESHOLD) { commit('nope'); return; }
    setAnimating(true);
    setDx(0); // spring back
  };

  const rot = Math.max(-14, Math.min(14, dx * 0.045));
  const likeOp = Math.max(0, Math.min(1, dx / THRESHOLD));
  const nopeOp = Math.max(0, Math.min(1, -dx / THRESHOLD));

  return (
    <div
      className={`tr-card${animating ? ' is-animating' : ''}`}
      style={{ transform: `translateX(${dx}px) rotate(${rot}deg)` }}
    >
      <div
        className="tr-capture"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-hidden="true"
      />
      <div className="tr-stamp tr-stamp-like" style={{ opacity: likeOp }}>SAVE</div>
      <div className="tr-stamp tr-stamp-nope" style={{ opacity: nopeOp }}>SKIP</div>
      {children}
    </div>
  );
});

export default SwipeCard;
