import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './theater-sheet.css';
import {
  getTheaterDirectory, getLocationOnce, distanceMiles,
} from '../lib/theaters.js';
import { useDismissAnimation, EXIT_MS } from '../lib/useDismissAnimation.js';
import * as haptics from '../lib/haptics.js';

/**
 * TheaterSheet — pick which theater the roulette is tuned to.
 *
 * Liquid-glass bottom sheet (same material as FunSheet): an "Everything"
 * row (the classic all-of-cinema random channel), then every supported
 * independent theater, searchable and optionally sorted by distance via a
 * one-shot geolocation request (denial just leaves the alphabetical order —
 * no nagging). Pure presentational: the parent owns the selected source.
 *
 * Sheet mechanics that are easy to lose and expensive to fake:
 *   - it leaves the way it arrived (useDismissAnimation → .is-closing);
 *   - the grabber is a real grabber — drag it down and the sheet goes;
 *   - the list is skeleton-sized while loading, so the sheet does not grow
 *     under the user's thumb the moment the directory lands;
 *   - the keyboard gets out of the way on Search, on a scroll, or on a drag.
 */

/** Enough placeholder rows to fill the list area on any phone we support. */
const SKELETON_ROWS = 6;
/** Drag past this and the release dismisses instead of springing back. */
const DISMISS_AFTER_PX = 110;

export default function TheaterSheet({ open, current, onPick, onClose }) {
  const [directory, setDirectory] = useState(null); // null = loading
  const [loadFailed, setLoadFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [loc, setLoc] = useState(null);      // {lat, lon} once granted
  const [locating, setLocating] = useState(false);
  const [locDenied, setLocDenied] = useState(false);

  const { mounted, closing, close } = useDismissAnimation(open, onClose);

  const inputRef = useRef(null);
  const sheetRef = useRef(null);
  const dragRef = useRef({ active: false, startY: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragged, setDragged] = useState(false);  // a drag has happened
  const [dragY, setDragY] = useState(0);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoadFailed(false);
    getTheaterDirectory()
      .then((d) => { if (!cancelled) setDirectory(d); })
      .catch(() => { if (!cancelled) { setDirectory([]); setLoadFailed(true); } });
    return () => { cancelled = true; };
  }, [open]);

  // Fresh sheet, fresh gesture state — a sheet reopened after a drag-dismiss
  // must not come back holding the old offset.
  useEffect(() => {
    if (!open) return;
    dragRef.current = { active: false, startY: 0 };
    setDragging(false);
    setDragged(false);
    setDragY(0);
  }, [open]);

  const q = query.trim().toLowerCase();

  const rows = useMemo(() => {
    if (!directory) return [];
    let list = directory;
    if (q) {
      list = list.filter((t) =>
        t.name.toLowerCase().includes(q) ||
        (t.region || '').toLowerCase().includes(q) ||
        (t.venue || '').toLowerCase().includes(q));
    }
    const withDist = list.map((t) => ({
      ...t,
      distance: (loc && t.lat != null) ? distanceMiles(loc.lat, loc.lon, t.lat, t.lon) : null,
    }));
    withDist.sort((a, b) => {
      if (a.distance != null && b.distance != null) return a.distance - b.distance;
      if (a.distance != null) return -1;
      if (b.distance != null) return 1;
      return a.name.localeCompare(b.name);
    });
    return withDist;
  }, [directory, q, loc]);

  /** Put the iOS keyboard away — on Search, on a list scroll, on a drag. */
  const dismissKeyboard = useCallback(() => {
    const el = inputRef.current;
    if (el && typeof document !== 'undefined' && document.activeElement === el) el.blur();
  }, []);

  const locate = async () => {
    haptics.light();
    dismissKeyboard();
    setLocating(true);
    setLocDenied(false);
    const got = await getLocationOnce();
    setLocating(false);
    if (got) setLoc(got);
    else setLocDenied(true);   // say so; a tap that does nothing reads as broken
  };

  const pick = (source) => {
    haptics.medium();
    dismissKeyboard();
    onPick(source);
    close();
  };

  // --- Drag-to-dismiss ------------------------------------------------------
  // Scoped to the grab strip (grabber + title) on purpose: the list below it
  // scrolls, and a sheet that dismisses when you meant to scroll is worse than
  // one that never dismisses at all.
  const onGrabDown = (e) => {
    dismissKeyboard();
    dragRef.current = { active: true, startY: e.clientY };
    setDragging(true);
    setDragged(true);
    setDragY(0);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onGrabMove = (e) => {
    if (!dragRef.current.active) return;
    const dy = e.clientY - dragRef.current.startY;
    // Downward tracks 1:1; upward is rubber-banded, so the sheet never lifts
    // off the bottom edge it is anchored to.
    setDragY(dy > 0 ? dy : dy / 5);
  };

  const onGrabUp = (e) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    setDragging(false);
    try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch { /* noop */ }
    if (dragY > DISMISS_AFTER_PX) {
      haptics.light();
      setDragY(sheetRef.current?.offsetHeight || 520);   // carry it out
      close();
    } else {
      setDragY(0);                                        // spring back
    }
  };

  // Once a drag has happened the shared funDown keyframes are suppressed (see
  // .theater-sheet.is-dragging in the CSS), so this transform IS the exit — no
  // matter who started the dismissal: the grabber, Close, the backdrop, a row,
  // or the parent flipping `open`.
  useEffect(() => {
    if (!closing || !dragged) return;
    setDragY((y) => (y > 0 ? y : (sheetRef.current?.offsetHeight || 520)));
  }, [closing, dragged]);

  if (!mounted) return null;

  const loading = directory === null;
  // Under the thumb: no transition, the sheet is the finger. Released short of
  // the threshold: spring home. Leaving: the app's exit curve and duration, so
  // a drag-out lands with the backdrop's own fade.
  const sheetStyle = dragged
    ? {
      transform: `translateY(${Math.round(dragY)}px)`,
      transition: dragging
        ? 'none'
        : (closing ? `transform ${EXIT_MS}ms var(--exit-ease)` : 'transform 0.26s var(--spring)'),
    }
    : undefined;

  return (
    <div className={`fun-backdrop${closing ? ' is-closing' : ''}`} onClick={close}>
      <div
        ref={sheetRef}
        className={`fun-sheet theater-sheet${closing ? ' is-closing' : ''}${dragged ? ' is-dragging' : ''}`}
        style={sheetStyle}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Theaters"
      >
        <div
          className="theater-grab"
          onPointerDown={onGrabDown}
          onPointerMove={onGrabMove}
          onPointerUp={onGrabUp}
          onPointerCancel={onGrabUp}
        >
          <div className="fun-handle" aria-hidden="true" />
          <h3 className="fun-title">Theaters</h3>
        </div>

        {/* The classic channel — all of cinema, fully random. */}
        <button
          type="button"
          className={`theater-row theater-row-everything${current ? '' : ' is-active'}`}
          onClick={() => pick(null)}
        >
          <span className="theater-mono" aria-hidden="true">∞</span>
          <span className="theater-meta">
            <span className="theater-name">Everything</span>
            <span className="theater-sub">Random across all of cinema</span>
          </span>
          {!current && <span className="theater-check" aria-hidden="true">✓</span>}
        </button>

        <div className="theater-tools">
          <div className="theater-search-wrap">
            <input
              ref={inputRef}
              className="theater-search"
              type="search"
              placeholder="Search theaters"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search theaters"
              /* Theater names are proper nouns: autocorrect rewrites them
                 mid-type and auto-capitalisation fights a lowercase match that
                 is case-insensitive anyway. */
              inputMode="search"
              enterKeyHint="search"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); dismissKeyboard(); }
              }}
            />
            {query && (
              /* -webkit-appearance: none strips iOS's own clear button, and
                 without a replacement the only way back to the full list is
                 select-all-delete. */
              <button
                type="button"
                className="theater-clear"
                aria-label="Clear search"
                onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              >
                <span aria-hidden="true">×</span>
              </button>
            )}
          </div>

          {loc ? (
            /* Granted. A permanently disabled pill still looks tappable, so
               this stops being a control and becomes what it now is: state. */
            <span className="theater-nearstate" role="status">
              <span aria-hidden="true">✓</span> Nearest first
            </span>
          ) : (
            <button
              type="button"
              className="theater-near"
              onClick={locate}
              disabled={locating}
              aria-busy={locating || undefined}
            >
              {locating ? 'Locating…' : 'Near me'}
            </button>
          )}
        </div>

        {locDenied && !loc && (
          <p className="theater-note" role="status">
            Location is off, so the list stays alphabetical.
          </p>
        )}

        <div
          className="theater-list"
          role="list"
          aria-busy={loading || undefined}
          onScroll={dismissKeyboard}
        >
          {/* Skeletons are row-shaped and row-sized: the sheet opens at the
              height it will keep, instead of a 120px box that balloons into a
              full list (moving the Close button out from under the thumb). */}
          {loading && Array.from({ length: SKELETON_ROWS }, (_, i) => (
            <div className="theater-row theater-row-skeleton" key={`skeleton-${i}`} aria-hidden="true">
              <span className="theater-mono theater-skel theater-skel-mono" />
              <span className="theater-meta">
                <span className="theater-skel theater-skel-name" />
                <span className="theater-skel theater-skel-sub" />
              </span>
            </div>
          ))}

          {!loading && loadFailed && (
            <div className="theater-empty">Couldn&apos;t load the theater list. Check your connection and reopen.</div>
          )}

          {!loading && !loadFailed && rows.length === 0 && (
            q ? (
              <div className="theater-empty">
                <div>No theaters match &ldquo;{query}&rdquo;.</div>
                <button type="button" className="theater-near" onClick={() => { setQuery(''); inputRef.current?.focus(); }}>
                  Clear search
                </button>
              </div>
            ) : (
              <div className="theater-empty">No theaters available right now.</div>
            )
          )}

          {rows.map((t) => {
            const active = current?.marketSlug === t.slug;
            return (
              <button
                key={t.id}
                type="button"
                className={`theater-row${active ? ' is-active' : ''}`}
                role="listitem"
                onClick={() => pick({ marketSlug: t.slug, marketName: t.name })}
              >
                <span className="theater-mono" aria-hidden="true">{t.name.charAt(0)}</span>
                <span className="theater-meta">
                  <span className="theater-name">{t.name}</span>
                  <span className="theater-sub">
                    {t.venue}
                    {t.region ? ` · ${t.region}` : ''}
                    {t.distance != null ? ` · ${Math.round(t.distance)} mi` : ''}
                  </span>
                </span>
                {active && <span className="theater-check" aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>

        <button type="button" className="fun-close" onClick={close}>Close</button>
      </div>
    </div>
  );
}
