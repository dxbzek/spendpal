import * as Sentry from '@sentry/react';

const isProd = import.meta.env.PROD;

export const logger = {
  error: (message: string, ...args: unknown[]) => {
    if (!isProd) {
      console.error(`[SpendPal ERROR] ${message}`, ...args);
    }
    // Capture to Sentry in production (no-op when DSN is not configured or not in prod)
    const err = args[0] instanceof Error ? args[0] : new Error(message);
    Sentry.captureException(err, { extra: { message, detail: args.slice(1) } });
  },
  warn: (message: string, ...args: unknown[]) => {
    if (!isProd) {
      console.warn(`[SpendPal WARN] ${message}`, ...args);
    }
  },
  info: (message: string, ...args: unknown[]) => {
    if (!isProd) {
      console.info(`[SpendPal INFO] ${message}`, ...args);
    }
  },
};
