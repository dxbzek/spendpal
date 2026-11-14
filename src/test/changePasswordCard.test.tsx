// Settings > Password: the rule is stated and enforced, and each failure
// points at the field that caused it.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const auth = vi.hoisted(() => ({
  user: { id: 'u1', email: 'sam@example.com' },
  changePassword: vi.fn(),
  requestPasswordReset: vi.fn(async () => ({ error: null })),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));

import ChangePasswordCard from '@/components/settings/ChangePasswordCard';

const fill = (current: string, next: string) => {
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: current } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: next } });
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
};

beforeEach(() => {
  for (const fn of [toast.error, toast.success, auth.changePassword, auth.requestPasswordReset]) fn.mockClear();
});

describe('Change password', () => {
  it('states the rule and refuses a short password before asking the server', () => {
    render(<ChangePasswordCard />);
    expect(screen.getByText('At least 8 characters')).toBeInTheDocument();
    fill('correct horse', 'short');
    expect(toast.error).toHaveBeenCalledWith('Password must be at least 8 characters.');
    expect(auth.changePassword).not.toHaveBeenCalled();
  });

  it('asks for the current password', () => {
    render(<ChangePasswordCard />);
    fill('', 'a new password');
    expect(toast.error).toHaveBeenCalledWith('Enter your current password.');
    expect(auth.changePassword).not.toHaveBeenCalled();
  });

  it('refuses a new password that is the current one', () => {
    render(<ChangePasswordCard />);
    fill('correct horse', 'correct horse');
    expect(toast.error).toHaveBeenCalledWith('The new password must be different from the current one.');
    expect(auth.changePassword).not.toHaveBeenCalled();
  });

  it('points at the current password when that is the wrong one', async () => {
    auth.changePassword.mockResolvedValue({ error: { code: 'invalid_credentials', message: 'Invalid login credentials' }, step: 'current', othersSignedOut: false });
    render(<ChangePasswordCard />);
    fill('wrong one', 'a new password');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Current password is wrong.'));
    // The typed values stay, so one field can be corrected.
    expect(screen.getByLabelText('New password')).toHaveValue('a new password');
  });

  it('does not blame the current password for a lost connection', async () => {
    auth.changePassword.mockResolvedValue({ error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 }, step: 'current', othersSignedOut: false });
    render(<ChangePasswordCard />);
    fill('correct horse', 'a new password');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not reach the server. Check your connection and try again.'));
  });

  it('changes the password and empties the fields', async () => {
    auth.changePassword.mockResolvedValue({ error: null, step: 'new', othersSignedOut: true });
    render(<ChangePasswordCard />);
    fill('correct horse', 'a new password');
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Password changed. Other devices were signed out.'));
    expect(auth.changePassword).toHaveBeenCalledWith('correct horse', 'a new password');
    expect(screen.getByLabelText('Current password')).toHaveValue('');
    expect(screen.getByLabelText('New password')).toHaveValue('');
  });

  it('emails a reset link to a signed-in user who forgot the current password', async () => {
    render(<ChangePasswordCard />);
    fireEvent.click(screen.getByRole('button', { name: /email me a reset link/i }));
    await waitFor(() => expect(auth.requestPasswordReset).toHaveBeenCalledWith('sam@example.com'));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Reset link sent to sam@example.com.'));
  });
});
