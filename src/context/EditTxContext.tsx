import { createContext, useContext } from 'react';
import type { Transaction } from '@/types/finance';

interface EditTxContextType {
  openEditSheet: (tx: Transaction) => void;
}

export const EditTxContext = createContext<EditTxContextType>({ openEditSheet: () => {} });
export const useEditTransaction = () => useContext(EditTxContext);
