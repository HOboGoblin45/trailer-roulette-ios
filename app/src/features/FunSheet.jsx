import './funsheet.css';

/**
 * FunSheet — a bottom-sheet menu listing the optional "fun modes".
 * Pure presentational: the parent owns open/active state.
 */
export default function FunSheet({ open, features, onPick, onClose }) {
  if (!open) return null;
  return (
    <div className="fun-backdrop" onClick={onClose}>
      <div className="fun-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Fun modes">
        <div className="fun-handle" aria-hidden="true" />
        <h3 className="fun-title">Fun modes</h3>
        <div className="fun-grid">
          {features.map((f) => (
            <button key={f.id} className="fun-item" onClick={() => onPick(f)}>
              <span className="fun-emoji" aria-hidden="true">{f.label.charAt(0)}</span>
              <span className="fun-label">{f.label}</span>
              <span className="fun-blurb">{f.blurb}</span>
            </button>
          ))}
        </div>
        <button className="fun-close" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
