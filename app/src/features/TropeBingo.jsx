import './trope-bingo.css';
import { useState, useMemo, useCallback } from 'react';
import * as haptics from '../lib/haptics.js';

/* The grand catalog of trailer clichés. ~32 strings, all ≤ ~26 chars so they
   wrap cleanly into a small square cell on a narrow phone. */
const TROPES = [
  'Record-scratch freeze frame',
  'Deep BWAAAM horn',
  '"In a world…" narrator',
  'Slow-mo walk from an explosion',
  'Sad, slow cover of a happy song',
  'City skyline establishing shot',
  'Hard cut to black + title card',
  'Spinning newspaper',
  'Villain monologue',
  'One-liner before the title drops',
  'Countdown timer',
  'Rain-soaked confrontation',
  'Dramatic whisper of the title',
  'Quick-cut montage on a beat drop',
  'Floating in space',
  '"Based on a true story"',
  '"This summer…"',
  'Dog or kid in peril',
  'Glass shattering in slow-mo',
  'Heartbeat sound effect',
  'Inception BRAAAM gets louder',
  'Gun cocks in silence',
  'Lens flare everywhere',
  'Single tear',
  'Car flips in slow motion',
  'Ticking clock close-up',
  'Whispered countdown',
  'Title letters slam together',
  'Helicopter over a desert',
  'Phone rings ominously',
  'Crowd parts in slow motion',
  'Vinyl scratch into needle drop',
];

const FREE_INDEX = 12; // center of a 5×5 grid (row 2, col 2)

/* The 12 winning lines of a 5×5 board: 5 rows, 5 columns, 2 diagonals.
   Each is a list of the 25 flat cell indices that form the line. */
const WIN_LINES = (() => {
  const lines = [];
  for (let r = 0; r < 5; r++) {
    lines.push([0, 1, 2, 3, 4].map((c) => r * 5 + c));
  }
  for (let c = 0; c < 5; c++) {
    lines.push([0, 1, 2, 3, 4].map((r) => r * 5 + c));
  }
  lines.push([0, 6, 12, 18, 24]); // top-left → bottom-right
  lines.push([4, 8, 12, 16, 20]); // top-right → bottom-left
  return lines;
})();

/* Fisher–Yates shuffle on a copy, then take the first 24 tropes and slot the
   FREE space into the center, producing 25 cell labels. */
function buildCard() {
  const pool = TROPES.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picks = pool.slice(0, 24);
  const cells = [];
  let p = 0;
  for (let i = 0; i < 25; i++) {
    cells.push(i === FREE_INDEX ? 'FREE' : picks[p++]);
  }
  return cells;
}

// A fresh marked-set: only the FREE space starts stamped.
const freshMarks = () => new Set([FREE_INDEX]);

export default function TropeBingo({ onClose }) {
  const [seed, setSeed] = useState(0); // bump to reshuffle the board
  const cells = useMemo(() => buildCard(), [seed]);

  const [marked, setMarked] = useState(freshMarks);
  // Which win-lines have already fired, so each line only celebrates once.
  const [wonLines, setWonLines] = useState(() => new Set());
  const [burst, setBurst] = useState(0); // bumps to retrigger the confetti
  const [showBanner, setShowBanner] = useState(false);

  const lineCount = wonLines.size;

  const toggleCell = useCallback(
    (idx) => {
      if (idx === FREE_INDEX) return; // FREE is permanent

      setMarked((prev) => {
        const next = new Set(prev);
        if (next.has(idx)) {
          next.delete(idx);
        } else {
          next.add(idx);
        }

        // Recompute which lines are now complete from this exact next state.
        const completed = new Set();
        for (let i = 0; i < WIN_LINES.length; i++) {
          if (WIN_LINES[i].every((c) => next.has(c))) completed.add(i);
        }

        // Did we just light up a line we hadn't celebrated before?
        setWonLines((prevWon) => {
          let isNew = false;
          for (const i of completed) {
            if (!prevWon.has(i)) {
              isNew = true;
              break;
            }
          }
          if (isNew) {
            haptics.heavy();
            setBurst((b) => b + 1);
            setShowBanner(true);
            window.clearTimeout(toggleCell._t);
            toggleCell._t = window.setTimeout(() => setShowBanner(false), 2200);
          }
          return completed; // unmarking a cell can also retract a line
        });

        return next;
      });

      haptics.light();
    },
    []
  );

  const newCard = useCallback(() => {
    haptics.medium();
    setSeed((s) => s + 1);
    setMarked(freshMarks());
    setWonLines(new Set());
    setShowBanner(false);
  }, []);

  return (
    <div className="feat feat-bingo">
      <button className="feat-close" onClick={onClose} aria-label="Close">
        ✕
      </button>

      <div className="bingo-head">
        <h2 className="bingo-title">
          <span className="bingo-title-pop">TROPE</span> BINGO
        </h2>
        <p className="bingo-sub">
          Tap a cliché when it hits the screen. Five in a row wins.
        </p>
      </div>

      <div className="bingo-toolbar">
        <button className="bingo-btn" onClick={newCard}>
          New card
        </button>
        <div
          className={'bingo-counter' + (lineCount ? ' is-hot' : '')}
          aria-live="polite"
        >
          Lines: <strong>{lineCount}</strong>
        </div>
      </div>

      <div className="bingo-board-wrap">
        <div className="bingo-grid" role="grid" aria-label="Trope bingo card">
          {cells.map((label, idx) => {
            const isFree = idx === FREE_INDEX;
            const isMarked = marked.has(idx);
            return (
              <button
                key={idx}
                role="gridcell"
                aria-pressed={isMarked}
                className={
                  'bingo-cell' +
                  (isMarked ? ' is-marked' : '') +
                  (isFree ? ' is-free' : '')
                }
                onClick={() => toggleCell(idx)}
              >
                <span className="bingo-cell-text">
                  {isFree ? '★ FREE ★' : label}
                </span>
                <span className="bingo-stamp" aria-hidden="true">
                  ✓
                </span>
              </button>
            );
          })}
        </div>

        {showBanner && (
          <div className="bingo-banner" role="status">
            <span className="bingo-banner-text">BINGO!</span>
          </div>
        )}

        {/* CSS-only confetti: re-keyed on each new bingo so it replays. */}
        {burst > 0 && (
          <div className="bingo-confetti" key={burst} aria-hidden="true">
            {Array.from({ length: 28 }).map((_, i) => (
              <span
                key={i}
                className="bingo-confetto"
                style={{
                  left: `${(i * 37) % 100}%`,
                  animationDelay: `${(i % 7) * 60}ms`,
                  '--drift': `${((i * 53) % 120) - 60}px`,
                  '--spin': `${((i * 97) % 720) - 360}deg`,
                  '--hue': `${(i * 47) % 360}`,
                }}
              />
            ))}
          </div>
        )}
      </div>

      <p className="bingo-foot">
        {lineCount === 0
          ? 'No lines yet — keep watching those trailers.'
          : lineCount === 1
          ? 'First BINGO! Go for the blackout.'
          : `${lineCount} lines and counting. Unstoppable.`}
      </p>
    </div>
  );
}
