// Registry of optional "fun modes". The core app stays two buttons (Play +
// AirPlay); these are extra, self-contained, full-screen overlays opened from
// the ✦ menu. Each Component takes a single { onClose } prop.
import RouletteWheel from './RouletteWheel.jsx';
import BlindDate from './BlindDate.jsx';
import GuessYear from './GuessYear.jsx';
import TimeMachine from './TimeMachine.jsx';
import TropeBingo from './TropeBingo.jsx';
import CinemaMode from './CinemaMode.jsx';

export const FEATURES = [
  { id: 'wheel',  label: 'Roulette Wheel',  blurb: 'Spin for a decade, then play',   Component: RouletteWheel },
  { id: 'blind',  label: 'Blind Date',      blurb: 'Watch first, reveal after',       Component: BlindDate },
  { id: 'year', label: 'Guess the Year', blurb: 'Name the exact year from the trailer', Component: GuessYear },
  { id: 'time',   label: 'Time Machine',    blurb: 'Drop into a random year',         Component: TimeMachine },
  { id: 'bingo',  label: 'Trope Bingo',     blurb: 'Spot the clichés — party game',   Component: TropeBingo },
  { id: 'cinema', label: 'Cinema Mode',     blurb: 'Hands-free channel for the TV',   Component: CinemaMode },
];
