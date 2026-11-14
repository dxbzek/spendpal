// The privacy page says Sentry receives error reports only. Performance
// tracing sent one visit in five with no error, request URLs included.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const main = readFileSync(resolve(__dirname, '../main.tsx'), 'utf8');
const privacy = readFileSync(resolve(__dirname, '../pages/Privacy.tsx'), 'utf8');

describe('what reaches Sentry matches the privacy page', () => {
  it('sends no performance traces', () => {
    expect(main).not.toMatch(/browserTracingIntegration|tracesSampleRate|tracesSampler/);
    expect(privacy).toContain('<strong>Sentry</strong> receives error reports when error reporting is switched on');
  });

  it('drops the query from request addresses in breadcrumbs', () => {
    expect(main).toContain("k === 'url' && typeof v === 'string' ? v.split('?')[0]");
  });
});
