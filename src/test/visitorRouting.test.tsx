// Who sees what at "/": a visitor gets the home page, a signed-in user gets
// the app. Other app addresses still send a visitor to sign in.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const auth = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => auth.current,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { ProtectedRoute } from '@/App';

const Where = () => <p data-testid="where">{useLocation().pathname}</p>;

const show = (path: string, user: { id: string } | null, extra: Record<string, unknown> = {}) => {
  auth.current = { user, loading: false, recovering: false, ...extra };
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Suspense fallback={<p>loading page</p>}>
        <Routes>
          <Route path="/" element={<ProtectedRoute><p>the app</p></ProtectedRoute>} />
          <Route path="/budgets" element={<ProtectedRoute><p>the app</p></ProtectedRoute>} />
          <Route path="/auth" element={<Where />} />
          <Route path="/reset" element={<Where />} />
        </Routes>
      </Suspense>
    </MemoryRouter>,
  );
};

describe('visitor routing', () => {
  it('shows a visitor the home page at "/"', async () => {
    show('/', null);
    expect(await screen.findByRole('link', { name: 'Create account' })).toBeInTheDocument();
    expect(screen.queryByText('the app')).toBeNull();
  });

  it('shows a signed-in user the app at "/", as before', () => {
    show('/', { id: 'u1' });
    expect(screen.getByText('the app')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Create account' })).toBeNull();
  });

  it('still sends a visitor from an app page to the sign-in form', () => {
    show('/budgets', null);
    expect(screen.getByTestId('where')).toHaveTextContent('/auth');
  });

  it('still sends a user opening a reset link to the reset form', () => {
    show('/', { id: 'u1' }, { recovering: true });
    expect(screen.getByTestId('where')).toHaveTextContent('/reset');
  });
});
