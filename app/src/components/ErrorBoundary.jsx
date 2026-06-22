import { Component } from 'react';
import { recordError } from '../lib/errorLog.js';

/**
 * ErrorBoundary — the "runs no matter what" backstop.
 *
 * If anything in the tree throws during render, React would normally unmount
 * the whole app and leave a blank screen. This catches it, shows a minimal
 * recover affordance, and — because a transient data glitch shouldn't strand
 * the user — also auto-resets shortly after so the feed comes back on its own.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
    this._timer = null;
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    // Log for diagnostics; never rethrow.
    console.error('[ErrorBoundary] recovered from', error, info?.componentStack);
    recordError('render', error?.message || String(error), error?.stack || info?.componentStack);
    // Auto-heal: clear the error after a beat so the subtree re-mounts fresh.
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.reset(), 2500);
  }

  componentWillUnmount() {
    clearTimeout(this._timer);
  }

  reset = () => {
    clearTimeout(this._timer);
    // Bumping the key remounts children from scratch.
    this.setState((s) => ({ failed: false, nonce: (s.nonce || 0) + 1 }));
  };

  render() {
    if (this.state.failed) {
      return (
        <button
          type="button"
          onClick={this.reset}
          style={{
            position: 'fixed', inset: 0, width: '100%', height: '100%',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 10, padding: 24,
            background: '#000', color: '#F5F6F8', border: 'none',
            fontFamily: '-apple-system, system-ui, sans-serif', cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: 40 }} aria-hidden="true">🎬</span>
          <span style={{ fontSize: 17, fontWeight: 600 }}>One sec…</span>
          <span style={{ fontSize: 14, opacity: 0.6 }}>Tap to keep watching</span>
        </button>
      );
    }
    return <div key={this.state.nonce || 0} style={{ display: 'contents' }}>{this.props.children}</div>;
  }
}
