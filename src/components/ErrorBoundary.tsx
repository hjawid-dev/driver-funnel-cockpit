import { Component, type ErrorInfo, type ReactNode } from 'react';
import { STORAGE_KEY } from '../lib/persist';

interface State {
  failed: boolean;
}

/** Last line of defence: never show a blank page. Offers a clean restart of the demo. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Cockpit crashed', error, info.componentStack);
  }

  private restart = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage blocked: a reload still gives fresh demo data.
    }
    window.location.reload();
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-6">
        <div className="max-w-md rounded-2xl border border-lavender bg-card p-6 text-center">
          <h1 className="text-lg font-bold">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted">The demo data saved in this browser could not be loaded. Restart with fresh demo data.</p>
          <button
            type="button"
            onClick={this.restart}
            className="mt-4 rounded-lg bg-indigo px-4 py-2 text-sm font-semibold text-white hover:bg-navy"
          >
            Reset demo
          </button>
        </div>
      </div>
    );
  }
}
