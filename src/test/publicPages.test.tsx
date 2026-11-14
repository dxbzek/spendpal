// The public pages: the home page for visitors, Privacy and Terms, and the
// legal links on the sign-in form. What they say, where their buttons go, and
// that nothing about the operator is made up.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const auth = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth.current }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import Landing from '@/pages/Landing';
import Privacy from '@/pages/Privacy';
import Terms from '@/pages/Terms';
import AuthPage from '@/pages/AuthPage';
import { OPERATOR_PENDING, GOVERNING_LAW_PENDING } from '@/lib/operator';
import { LEGAL_LAST_CHANGED, publicPage } from '@/lib/publicSite';

const setUser = (user: { id: string } | null) => {
  auth.current = {
    user, loading: false, recovering: false, linkFailed: false,
    signIn: vi.fn(), signUp: vi.fn(), resendConfirmation: vi.fn(), requestPasswordReset: vi.fn(),
  };
};

const Where = () => {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname}{(loc.state as { signup?: boolean } | null)?.signup ? ' signup' : ''}</p>;
};

const renderAt = (path: string, page: React.ReactElement, state?: unknown) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: path, state }]}>
      <Routes>
        <Route path={path} element={page} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );

describe('home page for visitors', () => {
  it('says what SpendPal is and sends both buttons to the sign-in page', () => {
    setUser(null);
    renderAt('/', <Landing />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/SpendPal is a personal finance tracker/)).toBeInTheDocument();
    expect(screen.getByText(/does not connect to your bank/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Create account' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/auth signup');
  });

  it('has a Sign in button that opens the sign-in form', () => {
    setUser(null);
    renderAt('/', <Landing />);
    const signIns = screen.getAllByRole('link', { name: 'Sign in' });
    expect(signIns.length).toBeGreaterThan(0);
    for (const link of signIns) expect(link).toHaveAttribute('href', '/auth');
  });

  it('lists the real features', () => {
    setUser(null);
    renderAt('/', <Landing />);
    for (const name of [
      'Accounts and cards', 'Budgets with month-end pace', 'Instalment plans', 'Savings goals',
      'Reports', 'Statement and screenshot import', 'AI budget advisor',
    ]) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
  });

  it('labels the example screen as sample data', () => {
    setUser(null);
    renderAt('/', <Landing />);
    const sample = screen.getByRole('figure');
    expect(within(sample).getByText('Sample data')).toBeInTheDocument();
  });

  it('makes no price, rating or user-count claim', () => {
    setUser(null);
    const { container } = renderAt('/', <Landing />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/pricing|per month|\$|free trial|trusted by|rated|stars|reviews|users love|certified|ISO 27001|SOC ?2/i);
  });

  it('links the privacy policy and terms from the footer', () => {
    setUser(null);
    renderAt('/', <Landing />);
    const legal = screen.getByRole('navigation', { name: 'Legal' });
    expect(within(legal).getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', '/privacy');
    expect(within(legal).getByRole('link', { name: 'Terms of use' })).toHaveAttribute('href', '/terms');
    // No contact link while there is no inbox to send to.
    expect(within(legal).queryByRole('link', { name: 'Contact' })).toBeNull();
  });

  it('sets the home page title', () => {
    setUser(null);
    renderAt('/', <Landing />);
    expect(document.title).toBe(publicPage('/')!.title);
  });
});

describe('privacy and terms', () => {
  it('the privacy page shows its date and says contact details are still to come', () => {
    setUser(null);
    renderAt('/privacy', <Privacy />);
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeInTheDocument();
    expect(screen.getByText(`Last changed ${LEGAL_LAST_CHANGED}`)).toBeInTheDocument();
    expect(LEGAL_LAST_CHANGED).toBe('14 November 2026');
    expect(screen.getByText(OPERATOR_PENDING)).toBeInTheDocument();
    expect(document.title).toBe(publicPage('/privacy')!.title);
  });

  it('the privacy page names every service data goes to', () => {
    setUser(null);
    const { container } = renderAt('/privacy', <Privacy />);
    const text = container.textContent ?? '';
    for (const name of ['Supabase', 'Vercel', 'Anthropic', 'Sentry', 'open.er-api.com']) expect(text).toContain(name);
    // The Settings actions, named as they are on screen.
    for (const label of ['Export', 'Delete All Transactions', 'Delete Everything', 'Delete my account']) {
      expect(text).toContain(label);
    }
  });

  it('the terms say the figures are not financial advice and the law is still to come', () => {
    setUser(null);
    renderAt('/terms', <Terms />);
    expect(screen.getByRole('heading', { level: 1, name: 'Terms of use' })).toBeInTheDocument();
    expect(screen.getByText(`Last changed ${LEGAL_LAST_CHANGED}`)).toBeInTheDocument();
    expect(screen.getByText(/not financial advice/)).toBeInTheDocument();
    expect(screen.getByText(GOVERNING_LAW_PENDING)).toBeInTheDocument();
  });

  it('offers a signed-in user the app, not the sign-in form', () => {
    setUser({ id: 'u1' });
    renderAt('/terms', <Terms />);
    expect(screen.getByRole('link', { name: 'Open app' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
  });
});

describe('sign-in page', () => {
  it('shows the agreement line with links under Create Account', () => {
    setUser(null);
    renderAt('/auth', <AuthPage />, { signup: true });
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeInTheDocument();
    const line = screen.getByText(/By creating an account you agree to the/);
    expect(within(line).getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
    expect(within(line).getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
  });

  it('opens on sign-in by default, without the agreement line', () => {
    setUser(null);
    renderAt('/auth', <AuthPage />);
    expect(screen.queryByRole('button', { name: 'Create Account' })).toBeNull();
    expect(screen.queryByText(/By creating an account you agree/)).toBeNull();
    // The legal pages are still one tap away.
    const legal = screen.getByRole('navigation', { name: 'Legal' });
    expect(within(legal).getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
  });
});
