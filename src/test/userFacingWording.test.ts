// Users of SpendPal cannot run SQL, open the Supabase dashboard or set a
// server key. Messages that tell them to do so, or that name the server's
// setup, belong in the logger. This scans every string in the app and the edge
// functions; log calls and comments are left out on purpose.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SCHEMA_BEHIND_MESSAGE } from '@/lib/dbSchema';
import { AI_UNAVAILABLE_MESSAGE, mapAiError } from '../../supabase/functions/_shared/aiErrors';

const root = resolve(__dirname, '../..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'test' || name === 'integrations' ? [] : files(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

const OPERATOR_WORDING = [
  /pending_migrations/,
  /SQL editor/i,
  /Supabase dashboard/i,
  /on this server/i,
  /contact support/i,
  /not set up/i,
  /\bmigration\b/i,
  /\bRLS\b/,
];

const isLogOrComment = (line: string) =>
  /^\s*(\/\/|\*|\/\*)/.test(line) || /\b(logger|console)\.(error|warn|info|log)\(/.test(line);

describe('user-facing wording', () => {
  it('no string shown to users tells them to run SQL or names the server setup', () => {
    const offenders: string[] = [];
    for (const file of [...files(join(root, 'src')), ...files(join(root, 'supabase/functions'))]) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (isLogOrComment(line)) return;
        const strings = line.match(/'[^']*'|"[^"]*"|`[^`]*`/g) ?? [];
        for (const s of strings) {
          if (OPERATOR_WORDING.some(re => re.test(s))) offenders.push(`${file.slice(root.length + 1)}:${i + 1} ${s}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('the schema warning is plain', () => {
    expect(SCHEMA_BEHIND_MESSAGE).toBe('SpendPal is being updated, some saves may fail for a few minutes.');
  });

  it('a bad AI key reads as AI being down, not as a server problem to report', () => {
    expect(mapAiError({ status: 401 }).error).toBe(AI_UNAVAILABLE_MESSAGE);
    expect(AI_UNAVAILABLE_MESSAGE).toBe('AI is unavailable right now. Try again later.');
  });
});
