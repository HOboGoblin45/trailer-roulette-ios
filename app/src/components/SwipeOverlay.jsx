import { useRef, useState } from 'react';

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
    setDrag(e.clientX - startX.current);
  };
  const onMouseUp = () => onTouchEnd();

  const indicator =
    drag >= THRESHOLD ? '♥ Seen it' : drag <= -THRESHOLD ? '✕ Skip it' : null;

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
        >
          {indicator}
        </div>
      )}
    </div>
  );
}
