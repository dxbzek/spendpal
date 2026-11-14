// The Add Transaction form in the page: what it shows with no accounts, which
// account it opens with, and what the Recurring switch saves.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Account, Transaction } from '@/types/finance';
import AddTransactionSheet from '@/components/transactions/AddTransactionSheet';

const addTransaction = vi.fn(async (tx: Omit<Transaction, 'id'>) => ({ ...tx, id: 'new' }));
const finance = {
  accounts: [] as Account[],
  transactions: [] as Transaction[],
  goals: [],
  loading: false,
  loadError: false,
  addTransaction,
  addTransfer: vi.fn(),
  updateTransaction: vi.fn(),
  removeTransaction: vi.fn(),
  addGoalProgress: vi.fn(),
};

vi.mock('@/context/FinanceContext', () => ({ useFinance: () => finance }));
vi.mock('@/context/CurrencyContext', () => ({
  useCurrency: () => ({ currency: 'AED', fmt: (n: number) => `AED ${n}` }),
}));
vi.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({
    getCategoriesForType: () => [{ name: 'Subscriptions', icon: 'x' }],
    refresh: () => {},
  }),
}));
vi.mock('@/components/forms/AddAccountDialog', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div>Add Account dialog</div> : null),
}));

const account = (id: string): Account => ({ id, name: `Account ${id}`, type: 'debit', balance: 100, currency: 'AED', icon: 'x' });

const open = () => render(<AddTransactionSheet open onOpenChange={() => {}} />);

beforeEach(() => {
  finance.accounts = [];
  finance.loading = false;
  finance.loadError = false;
  addTransaction.mockClear();
});

describe('Add Transaction with no accounts', () => {
  it('asks for an account instead of showing a form that cannot be saved', () => {
    open();
    expect(screen.getByText('Add an account first')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Amount/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add Expense' })).toBeNull();
  });

  it('opens Add Account from there', () => {
    open();
    expect(screen.queryByText('Add Account dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add account' }));
    expect(screen.getByText('Add Account dialog')).toBeInTheDocument();
  });

  it('shows the form while accounts are loading or after a failed load', () => {
    finance.loadError = true;
    open();
    expect(screen.queryByText('Add an account first')).toBeNull();
    expect(screen.getByLabelText(/Amount/)).toBeInTheDocument();
  });
});

describe('saving from the form', () => {
  const fill = () => {
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '20' } });
    fireEvent.click(screen.getByTitle('Subscriptions'));
  };

  it('the only account is already selected', async () => {
    finance.accounts = [account('a')];
    open();
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Add Expense' }));
    await waitFor(() => expect(addTransaction).toHaveBeenCalledTimes(1));
    expect(addTransaction.mock.calls[0][0].accountId).toBe('a');
  });

  it('with several accounts none is guessed, and nothing is saved until one is picked', async () => {
    finance.accounts = [account('a'), account('b')];
    open();
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Add Expense' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add Expense' })).not.toBeDisabled());
    expect(addTransaction).not.toHaveBeenCalled();
  });

  it('Recurring on saves a recurring bill, not an instalment plan', async () => {
    finance.accounts = [account('a')];
    open();
    fill();
    fireEvent.click(screen.getByText('More options'));
    // Recurring is the first switch; Installment Plan appears under it, switched off.
    fireEvent.click(screen.getAllByRole('switch')[0]);
    expect(screen.getByText('Installment Plan')).toBeInTheDocument();
    expect(screen.queryByText('Installments paid so far')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add Expense' }));
    await waitFor(() => expect(addTransaction).toHaveBeenCalledTimes(1));
    const saved = addTransaction.mock.calls[0][0];
    expect(saved.isRecurring).toBe(true);
    expect(saved.totalInstallments).toBeUndefined(); // was 12
    expect(saved.currentInstallment).toBeUndefined(); // was 1
    expect(saved.planId).toBeUndefined();
  });

  it('a plan on a card starts at 0 paid, and is saved with a plan id', async () => {
    finance.accounts = [account('a')];
    open();
    fill();
    fireEvent.click(screen.getByText('More options'));
    fireEvent.click(screen.getAllByRole('switch')[0]); // Recurring
    fireEvent.click(screen.getAllByRole('switch')[3]); // Installment Plan (after Internal and Pending)
    const paid = screen.getByLabelText('Installments paid so far') as HTMLInputElement;
    expect(paid.value).toBe('1'); // paid from cash: this row is the first payment
    fireEvent.click(screen.getAllByRole('switch')[4]); // Tracking Only
    expect(paid.value).toBe('0');
    fireEvent.click(screen.getByRole('button', { name: 'Add Expense' }));
    await waitFor(() => expect(addTransaction).toHaveBeenCalledTimes(1));
    const saved = addTransaction.mock.calls[0][0];
    expect(saved.totalInstallments).toBe(12);
    expect(saved.currentInstallment).toBe(0);
    expect(saved.isTrackingOnly).toBe(true);
    expect(saved.planId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
