import type { Transaction } from '@/types/finance';

export const exportTransactionsCsv = (transactions: Transaction[], accounts: { id: string; name: string }[]) => {
  const accountMap = Object.fromEntries(accounts.map(a => [a.id, a.name]));
  
  const headers = ['Date', 'Type', 'Category', 'Merchant', 'Amount', 'Currency', 'Account', 'Recurring', 'Note'];
  const rows = transactions.map(tx => [
    tx.date,
    tx.type,
    tx.category,
    tx.merchant,
    tx.amount.toFixed(2),
    tx.currency,
    accountMap[tx.accountId] || '',
    tx.isRecurring ? 'Yes' : 'No',
    tx.note || '',
  ]);

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};
