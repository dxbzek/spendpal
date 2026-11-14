// The 404 page: a visitor is not addressed as a signed-in user, and search
// engines are asked not to index it.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const auth = vi.hoisted(() => ({ current: { user: null as { id: string } | null, loading: false } }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth.current }));

import NotFound from '@/pages/NotFound';

const show = (state: { user?: { id: string } | null; loading?: boolean } = {}) => {
  auth.current = { user: null, loading: false, ...state };
  return render(<MemoryRouter initialEntries={['/no-such-page']}><NotFound /></MemoryRouter>);
};

describe('404 page', () => {
  it('gives a visitor "Page not found" and one link, to sign in', () => {
    show();
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/auth');
    expect(links[0]).toHaveTextContent('Go to sign in');
    // Nothing that assumes an account.
    expect(screen.queryByText(/your data/i)).toBeNull();
    expect(screen.queryByText('Dashboard')).toBeNull();
  });

  it('keeps the shortcuts for a signed-in user', () => {
    show({ user: { id: 'u1' } });
    expect(screen.getAllByRole('link').map(l => l.getAttribute('href'))).toEqual(['/', '/transactions', '/budgets', '/settings']);
    // The same names as the navs: the start page is Home, not Dashboard.
    expect(screen.getAllByRole('link').map(l => l.textContent)).toEqual(['Home', 'Transactions', 'Budgets', 'Settings']);
    expect(screen.getByText(/your data is safe/i)).toBeInTheDocument();
  });

  it('waits for the session before choosing which page to show', () => {
    show({ loading: true });
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('asks search engines not to index it, only while it is showing', () => {
    const robots = () => document.head.querySelectorAll('meta[name="robots"][content="noindex"]');
    expect(robots()).toHaveLength(0);
    const page = show();
    expect(robots()).toHaveLength(1);
    page.unmount();
    expect(robots()).toHaveLength(0);
  });
});
