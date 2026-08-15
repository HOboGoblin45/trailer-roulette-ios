import { Component } from 'react';
import { recordError } from '../lib/errorLog.js';

/**
 * ErrorBoundary — the "runs no matter what" backstop.
 *
 * If anything in the tree throws during render, React would normally unmount
 * the whole app and leave a blank screen. This catches it, auto-heals once or
 * twice (a transient data glitch shouldn't strand anyone), and — when the
 * fault is clearly not transient — stops and says so.
 *
 * Two things this screen must never do, both of which it used to:
 *
 *  1. Look like a different app. It was flat #000 with a system font stack and
 *     none of the app's tokens, glass or accent, so the one moment the user is
 *     already unsure whether the app is broken was also the one screen that
 *     looked broken. It now wears the same .screen canvas and error card as
 *     the rest of the app.
 *
 *  2. Loop forever. The old auto-reset fired unconditionally every 2.5s, so a
 *     persistent cause (bad state read back from storage, say) produced an
 *     endless crash → black flash → crash cycle with no explanation and no way
 *     out. Auto-recovery is now budgeted: AUTO_RECOVER_LIMIT attempts inside
 *     AUTO_RECOVER_WINDOW_MS, after which the screen stays put and offers the
 *     user something to actually do. Tapping the manual retry buys a fresh
 *     budget, because a user-initiated attempt is not a loop.
 */

const AUTO_RECOVER_DELAY_MS = 2500;
const AUTO_RECOVER_LIMIT = 3;
const AUTO_RECOVER_WINDOW_MS = 60000;

const SUPPORT_EMAIL = 'crescicharles@gmail.com';
const VERSION = import.meta.env.VITE_APP_VERSION || 'dev';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false, stuck: false, detail: '' };
    this._timer = null;
    this._attempts = [];   // timestamps of recent auto-recoveries
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    // Log for diagnostics; never rethrow. (About surfaces this log read-only.)
    console.error('[ErrorBoundary] recovered from', error, info?.componentStack);
    const detail = error?.message || String(error);
    recordError('render', detail, error?.stack || info?.componentStack);

    const now = Date.now();
    this._attempts = this._attempts.filter((t) => now - t < AUTO_RECOVER_WINDOW_MS);

    if (this._attempts.length >= AUTO_RECOVER_LIMIT) {
      // Auto-healing is not working. Stop flashing and hand over to the user.
      clearTimeout(this._timer);
      this._timer = null;
      this.setState({ stuck: true, detail });
      return;
    }

    this._attempts.push(now);
    this.setState({ detail });
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.reset(), AUTO_RECOVER_DELAY_MS);
  }

  componentWillUnmount() {
    clearTimeout(this._timer);
  }

  /** Auto-recovery, and the user's own retry — which also refills the budget. */
  reset = (userInitiated = false) => {
    clearTimeout(this._timer);
    this._timer = null;
    if (userInitiated === true) this._attempts = [];
    // Bumping the key remounts children from scratch.
    this.setState((s) => ({
      failed: false, stuck: false, nonce: (s.nonce || 0) + 1,
    }));
  };

  mailtoHref() {
    const subject = `Trailer Roulette ${VERSION} keeps crashing`;
    const body = [
      'What I was doing:',
      '',
      '',
      '---',
      `Version: ${VERSION}`,
      `Error: ${this.state.detail || 'unknown'}`,
    ].join('\n');
    return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  render() {
    if (this.state.failed) {
      const { stuck } = this.state;
      return (
        <div className="screen">
          <div className="tmdb-error-banner" role="alert">
            <div>
              <strong>{stuck ? 'Trailer Roulette keeps stopping.' : 'Something went wrong.'}</strong>
            </div>
            <div>
              {stuck
                ? 'Reopening it has not helped. Closing the app and starting it again usually clears this — and if you send us the details, we can fix it properly.'
                : 'Putting the channel back together — this takes a couple of seconds.'}
            </div>
            <button type="button" onClick={() => this.reset(true)}>
              {stuck ? 'Try once more' : 'Keep watching'}
            </button>
            {stuck && (
              <div>
                <a href={this.mailtoHref()}>Email us what happened →</a>
              </div>
            )}
          </div>
        </div>
      );
    }
    return <div key={this.state.nonce || 0} style={{ display: 'contents' }}>{this.props.children}</div>;
  }
}
