const isProd = import.meta.env.PROD;

export const logger = {
  error: (message: string, ...args: unknown[]) => {
    if (!isProd) {
      console.error(`[SpendPal ERROR] ${message}`, ...args);
    }
    // In production, errors are silently swallowed here.
    // Wire up a real error reporting service (e.g. Sentry) in future.
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
