// The glossary explained widgets no page rendered, listed transfer categories
// the form never saves, missed the labels a new user meets first, and every
// "?" opened the top of the page.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import Glossary from '@/pages/Glossary';
import { FAQ, GLOSSARY, findTerm, glossaryHref } from '@/lib/glossary';

const root = resolve(__dirname, '../..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'test' ? [] : sources(p);
    return /\.tsx$/.test(name) ? [p] : [];
  });
}

describe('glossary content', () => {
  const terms = GLOSSARY.map(e => e.term);

  it('explains the labels a new user meets on Home, the forms and the lists', () => {
    for (const t of ['Spendable Cash', 'Left until payday', 'Total Net Worth', 'Pending', 'Tracking Only', 'APR',
      'Remaining Principal', 'Internal / not real spending', 'Card credit']) {
      expect(terms, t).toContain(t);
    }
  });

  it('has no entries for widgets no page shows or labels that are not on screen', () => {
    for (const t of ['Saved This Month', 'Available Limit', 'Spending Breakdown', 'Net Worth']) {
      expect(terms, t).not.toContain(t);
    }
  });

  it('does not say transfers have their own categories: the form saves them all as Transfer', () => {
    const transfer = GLOSSARY[findTerm(GLOSSARY, 'Transfer')].definition;
    expect(transfer).not.toMatch(/Card Payment|Allowance/);
    expect(transfer).toContain('Transfer category');
  });

  it('every "?" link in the app names an entry', () => {
    const linked = sources(join(root, 'src')).flatMap(f =>
      [...readFileSync(f, 'utf8').matchAll(/<GlossaryLink term="([^"]+)"/g)].map(m => m[1]));
    expect(linked.length).toBeGreaterThan(0);
    for (const t of linked) expect(findTerm(GLOSSARY, t), t).toBeGreaterThanOrEqual(0);
  });

  it('has real questions', () => {
    expect(FAQ.length).toBeGreaterThanOrEqual(4);
  });

  it('finds a term without regard to case', () => {
    expect(findTerm(GLOSSARY, 'credit utilization')).toBe(findTerm(GLOSSARY, 'Credit Utilization'));
    expect(findTerm(GLOSSARY, 'nope')).toBe(-1);
    expect(findTerm(GLOSSARY, null)).toBe(-1);
    expect(glossaryHref('Month vs Month')).toBe('/glossary?term=Month%20vs%20Month');
  });
});

describe('glossary page', () => {
  it('opens the term a "?" link names', () => {
    render(<MemoryRouter initialEntries={[glossaryHref('Credit Utilization')]}><Glossary /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Credit Utilization' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/as a percentage/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Spendable Cash' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens nothing without a term', () => {
    render(<MemoryRouter initialEntries={['/glossary']}><Glossary /></MemoryRouter>);
    for (const b of screen.getAllByRole('button')) expect(b).toHaveAttribute('aria-expanded', 'false');
  });
});
