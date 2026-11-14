// Which two rows make one transfer. Pure, so it is unit-tested.
//
// A transfer is an expense row on the source account and an income row on the
// destination, both in category Transfer. New transfers carry the same
// transfer id on both rows and are paired on it. Older rows have none: they
// are paired on date + amount, taking a partner with the same note first.
// Date + amount alone crossed two equal transfers made on one day, and then
// edit or delete removed the other transfer's income row.
import type { Transaction } from '@/types/finance';

export interface TransferPair {
  from: Transaction;
  to: Transaction;
}

const isTransferRow = (t: Transaction) => t.category === 'Transfer';
const sameNote = (a: Transaction, b: Transaction) => (a.note ?? '') === (b.note ?? '');

/** Every transfer, keyed by the id of its expense (source) row. */
export function pairTransfers(transactions: Transaction[]): Map<string, TransferPair> {
  const pairs = new Map<string, TransferPair>();
  const taken = new Set<string>();
  const outs = transactions.filter(t => isTransferRow(t) && t.type === 'expense');
  const ins = transactions.filter(t => isTransferRow(t) && t.type === 'income');

  const pair = (from: Transaction, find: (to: Transaction) => boolean) => {
    if (pairs.has(from.id)) return;
    const to = ins.find(t => !taken.has(t.id) && find(t));
    if (!to) return;
    pairs.set(from.id, { from, to });
    taken.add(to.id);
  };

  // 1. Rows that say which transfer they belong to.
  for (const from of outs) {
    if (from.transferId) pair(from, to => to.transferId === from.transferId);
  }
  // 2. Older rows: same date and amount, and the same note. The app has
  //    written "From → To" on both halves since transfers became one insert.
  const legacy = (from: Transaction, to: Transaction) =>
    !to.transferId && to.date === from.date && to.amount === from.amount;
  for (const from of outs) {
    if (!from.transferId) pair(from, to => legacy(from, to) && sameNote(from, to));
  }
  // 3. The oldest rows have a different note on each half ("Transfer to X" /
  //    "Transfer from Y"), so what is left pairs on date and amount alone.
  for (const from of outs) {
    if (!from.transferId) pair(from, to => legacy(from, to));
  }
  return pairs;
}

/** The income half of the transfer whose expense half is `tx`, if it has one. */
export const transferPartner = (transactions: Transaction[], tx: Transaction): Transaction | undefined =>
  pairTransfers(transactions).get(tx.id)?.to;
