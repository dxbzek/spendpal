import React from 'react';
import * as Sentry from '@sentry/react';
import { logger } from '@/lib/logger';

interface Props {
  children: React.ReactNode;
  /** 'screen' = full-page fallback (default); 'inline' = compact chip for a single widget/section. */
  variant?: 'screen' | 'inline';
  /** For the inline variant: what failed, e.g. "this chart". */
  label?: string;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    logger.error('Unhandled render error', error, info.componentStack);
    // Report render-time exceptions to Sentry (beforeSend in main.tsx scrubs PII).
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
  }

  private reset = () => this.setState({ hasError: false, message: '' });

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.variant === 'inline') {
      return (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <span>Couldn't load {this.props.label ?? 'this section'}.</span>
          <button onClick={this.reset} className="font-medium text-primary hover:underline">
            Retry
          </button>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center space-y-4 max-w-sm">
          <p className="text-4xl">⚠️</p>
          <h1 className="text-xl font-semibold">Something went wrong on our end</h1>
          <p className="text-sm text-muted-foreground">
            Your data is safe — we just couldn't load this screen.
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => window.location.assign('/')}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
            >
              Go to Home
            </button>
            <button
              onClick={this.reset}
              className="px-4 py-2 rounded-lg border border-border text-sm font-medium"
            >
              Try again
            </button>
          </div>
          <details className="text-left">
            <summary className="text-xs text-muted-foreground cursor-pointer">Show technical details</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] text-muted-foreground bg-muted/50 rounded-lg p-2">
              {this.state.message}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
