import './trope-bingo.css';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import * as haptics from '../lib/haptics.js';
import { useOverlay } from './overlay.js';

const TITLE = 'Trope Bingo';

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

const BANNER_MS = 2200; // how long "BINGO!" stays up
const DEAL_MS = 620;    // covers the staggered re-deal of all 25 cells

export default function TropeBingo({ onClose }) {
  const { closing, close, dialogProps } = useOverlay({ onClose, label: TITLE });
  const [seed, setSeed] = useState(0); // bump to reshuffle the board
  const cells = useMemo(() => { void seed; return buildCard(); }, [seed]);

  const [marked, setMarked] = useState(freshMarks);
  // Which win-lines have already fired, so each line only celebrates once.
  const [wonLines, setWonLines] = useState(() => new Set());
  const [burst, setBurst] = useState(0); // bumps to retrigger the confetti
  const [showBanner, setShowBanner] = useState(false);
  const [dealing, setDealing] = useState(false); // re-deal animation in flight

  // Mirrors of the two sets above. The win check used to run inside the
  // setMarked/setWonLines updaters, which made those updaters impure — under
  // StrictMode React runs them twice and the celebration fired twice with it.
  const markedRef = useRef(marked);
  const wonLinesRef = useRef(wonLines);

  const bannerTimer = useRef(null);
  const dealTimer = useRef(null);
  useEffect(() => () => {
    // Timers used to hang off the handler function itself and outlived the
    // panel; they are cleared with it now.
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    if (dealTimer.current) clearTimeout(dealTimer.current);
  }, []);

  const lineCount = wonLines.size;

  const toggleCell = useCallback(
    (idx) => {
      if (idx === FREE_INDEX) return; // FREE is permanent
      haptics.light();

      const next = new Set(markedRef.current);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      markedRef.current = next;
      setMarked(next);

      // Recompute which lines are complete from this exact next state.
      const completed = new Set();
      for (let i = 0; i < WIN_LINES.length; i++) {
        if (WIN_LINES[i].every((c) => next.has(c))) completed.add(i);
      }

      // Did we just light up a line we hadn't celebrated before?
      let isNew = false;
      for (const i of completed) {
        if (!wonLinesRef.current.has(i)) {
          isNew = true;
          break;
        }
      }
      wonLinesRef.current = completed;
      setWonLines(completed); // unmarking a cell can also retract a line

      if (isNew) {
        haptics.heavy();
        setBurst((b) => b + 1);
        setShowBanner(true);
        if (bannerTimer.current) clearTimeout(bannerTimer.current);
        bannerTimer.current = setTimeout(() => {
          bannerTimer.current = null;
          setShowBanner(false);
        }, BANNER_MS);
      }
    },
    []
  );

  const newCard = useCallback(() => {
    haptics.medium();
    setSeed((s) => s + 1);
    markedRef.current = freshMarks();
    setMarked(markedRef.current);
    wonLinesRef.current = new Set();
    setWonLines(wonLinesRef.current);
    setShowBanner(false);
    if (bannerTimer.current) {
      clearTimeout(bannerTimer.current);
      bannerTimer.current = null;
    }
    // All 24 labels used to change under the user's finger with no signal that
    // anything had happened. Hold a class while the cells deal back in.
    setDealing(true);
    if (dealTimer.current) clearTimeout(dealTimer.current);
    dealTimer.current = setTimeout(() => {
      dealTimer.current = null;
      setDealing(false);
    }, DEAL_MS);
  }, []);

  return (
    <div className={`feat feat-bingo${closing ? ' is-closing' : ''}`} {...dialogProps}>
      <button type="button" className="feat-close" onClick={close} aria-label="Close">
        ✕
      </button>

      <div className="bingo-head">
        <h1 className="feat-title">{TITLE}</h1>
        <p className="bingo-sub">
          Tap a cliché when it hits the screen. Five in a row wins.
        </p>
      </div>

      <div className="bingo-toolbar">
        <button type="button" className="bingo-btn" onClick={newCard}>
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
        {/* A role="grid" whose children are 25 gridcells with no role="row" in
            between is invalid, and VoiceOver's grid navigation gave up on it.
            These are 25 toggle buttons; a labelled group says exactly that and
            keeps aria-pressed doing the work. */}
        <div
          className={`bingo-grid${dealing ? ' is-dealing' : ''}`}
          role="group"
          aria-label="Trope bingo card"
        >
          {cells.map((label, idx) => {
            const isFree = idx === FREE_INDEX;
            const isMarked = marked.has(idx);
            return (
              <button
                key={idx}
                type="button"
                aria-pressed={isMarked}
                aria-disabled={isFree || undefined}
                aria-label={isFree ? 'Free space, always marked' : undefined}
                className={
                  'bingo-cell' +
                  (isMarked ? ' is-marked' : '') +
                  (isFree ? ' is-free' : '')
                }
                style={{ '--i': idx }}
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
