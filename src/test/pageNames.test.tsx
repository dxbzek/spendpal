// One name per screen: the phone nav, the desktop sidebar and the page titles
// used to disagree ("Txns", "Advisor", "AI Budget Advisor", "Overview").
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import BottomNav from '@/components/layout/BottomNav';
import DesktopSidebar from '@/components/layout/DesktopSidebar';
import { ACCOUNT_TYPE_GROUP_NAMES, ACCOUNT_TYPE_NAMES, PAGE_NAMES } from '@/lib/pageNames';

const root = resolve(__dirname, '../..');
const page = (name: string) => readFileSync(join(root, 'src/pages', `${name}.tsx`), 'utf8');

describe('page names', () => {
  it('the phone nav and the desktop sidebar use the same name for each page', () => {
    const phone = render(<MemoryRouter><BottomNav onAddClick={() => {}} /></MemoryRouter>);
    for (const path of ['/', '/transactions', '/installments', '/accounts', '/budgets'] as const) {
      expect(screen.getByRole('button', { name: PAGE_NAMES[path] })).toBeInTheDocument();
    }
    phone.unmount();

    render(<MemoryRouter><DesktopSidebar onAddClick={() => {}} /></MemoryRouter>);
    for (const path of ['/', '/transactions', '/accounts', '/budgets', '/goals', '/debt', '/installments', '/reports', '/calendar', '/advisor', '/settings'] as const) {
      expect(screen.getByRole('button', { name: PAGE_NAMES[path] })).toBeInTheDocument();
    }
  });

  it('page titles match the nav names', () => {
    expect(page('AIAdvisor')).toContain('>AI Advisor</h1>');
    expect(page('Goals')).toContain('>Goals</h1>');
    expect(page('Debt')).toContain('>Debt</h1>');
    expect(page('Dashboard')).toContain("{PAGE_NAMES['/']}</h1>");
    expect(page('Dashboard')).not.toMatch(/>Overview</);
    expect(page('NotFound')).not.toContain('"Dashboard"');
  });

  it('the public pages call the advisor by its page name', () => {
    for (const name of ['Landing', 'Privacy', 'Terms']) {
      expect(page(name)).not.toMatch(/AI budget advisor/i);
      expect(page(name)).toContain(PAGE_NAMES['/advisor']);
    }
  });

  it('account types have one name each', () => {
    expect(ACCOUNT_TYPE_NAMES).toEqual({ cash: 'Cash', debit: 'Bank account', credit: 'Credit card' });
    expect(ACCOUNT_TYPE_GROUP_NAMES.debit).toBe('Bank accounts');
    expect(page('Dashboard')).not.toContain('Debit Cards');
    expect(page('Accounts')).not.toContain("'Debit Card'");
  });
});
