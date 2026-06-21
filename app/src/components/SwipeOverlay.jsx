import { useEffect, useRef, useState } from 'react';

/**
 * Swipe overlay — captures left/right gestures over the player.
 *
 * Behavior:
 *   - swipe right (>= threshold)  → onSeen()
 *   - swipe left  (>= threshold)  → onSkip()
 *   - tap (under threshold)       → noop (player handles its own tap)
 *
 * The overlay is partially transparent and only intercepts horizontal motion;
 * vertical scroll passes through to the body so filters/Up Next remain reachable.
 */
const THRESHOLD = 80; // px

export default function SwipeOverlay({ onSeen, onSkip, disabled }) {
  const startX = useRef(null);
  const startY = useRef(null);
  const [drag, setDrag] = useState(0);

  // Keyboard accessibility: ArrowRight → Seen, ArrowLeft → Skip.
  // Active only while enabled; ignores keystrokes aimed at form fields.
  useEffect(() => {
    if (disabled) return undefined;
    const onKeyDown = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.target?.isContentEditable) return;
      if (e.key === 'ArrowRight') onSeen?.();
      else if (e.key === 'ArrowLeft') onSkip?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [disabled, onSeen, onSkip]);

  if (disabled) return null;

  const onTouchStart = (e) => {
    const t = e.touches[0];
    startX.current = t.clientX;
    startY.current = t.clientY;
  };

  const onTouchMove = (e) => {
    if (startX.current == null) return;
    const t = e.touches[0];
    const dx = t.clientX - startX.current;
    const dy = t.clientY - startY.current;
    if (Math.abs(dx) > Math.abs(dy)) {
      setDrag(dx);
      // Don't preventDefault unconditionally; let vertical scroll happen.
    }
  };

  const onTouchEnd = () => {
    if (drag >= THRESHOLD) onSeen?.();
    else if (drag <= -THRESHOLD) onSkip?.();
    setDrag(0);
    startX.current = null;
    startY.current = null;
  };

  // Mouse handlers for web QA / TestFlight on Mac browser previews.
  const onMouseDown = (e) => {
    startX.current = e.clientX;
    startY.current = e.clientY;
  };
  const onMouseMove = (e) => {
    if (startX.current == null) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    // Only engage when horizontal movement dominates, so vertical scroll
    // (and the click that follows a drag-less press) passes through.
    if (Math.abs(dx) > Math.abs(dy)) {
      setDrag(dx);
    }
  };
  const onMouseUp = () => onTouchEnd();

  // Progressive feedback: fade the indicator in as the drag grows, reaching
  // full opacity at the threshold instead of snapping in only once past it.
  const absDrag = Math.abs(drag);
  const indicatorOpacity = Math.min(1, absDrag / THRESHOLD);
  const indicator =
    absDrag > 8 ? (drag > 0 ? '♥ Seen it' : '✕ Skip it') : null;

  return (
    <div
      className="swipe-overlay"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={() => { startX.current = null; setDrag(0); }}
      style={{ transform: `translateX(${drag * 0.4}px)` }}
      aria-hidden="true"
    >
      {indicator && (
        <div
          className={`swipe-indicator ${drag > 0 ? 'right' : 'left'}`}
          style={{ opacity: indicatorOpacity }}
        >
          {indicator}
        </div>
      )}
    </div>
  );
}
