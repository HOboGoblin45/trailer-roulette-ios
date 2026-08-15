import './funsheet.css';
import { useOverlay } from './overlay.js';

/**
 * FunSheet — a bottom-sheet menu listing the optional "fun modes".
 * Pure presentational: the parent owns open/active state. The sheet holds its
 * own mount for the exit animation (useOverlay) so it leaves the way it
 * arrived instead of being cut mid-spring.
 */
export default function FunSheet({ open, features = [], onPick, onClose }) {
  const { mounted, closing, close, dialogProps } = useOverlay({
    open,
    onClose,
    label: 'Fun modes',
  });
  if (!mounted) return null;

  return (
    <div className={`fun-backdrop${closing ? ' is-closing' : ''}`} onClick={close}>
      <div
        className={`fun-sheet${closing ? ' is-closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
        {...dialogProps}
      >
        <div className="fun-handle" aria-hidden="true" />
        <h3 className="fun-title">Fun modes</h3>
        <div className="fun-grid">
          {features.map((f) => (
            <button key={f.id} type="button" className="fun-item" onClick={() => onPick(f)}>
              <span className="fun-emoji" aria-hidden="true">{f.label.charAt(0)}</span>
              <span className="fun-label">{f.label}</span>
              <span className="fun-blurb">{f.blurb}</span>
            </button>
          ))}
        </div>
        <button type="button" className="fun-close" onClick={close}>Close</button>
      </div>
    </div>
  );
}
