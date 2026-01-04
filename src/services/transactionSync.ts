import AsyncStorage from '@react-native-async-storage/async-storage';
import { Transaction, SheetWriteMode } from '../types/budget';
import { googleSheetsService } from './googleSheets';

export interface PendingTransaction {
  id: string;
  transaction: Transaction;
  spreadsheetId: string;
  sheetName: string;
  writeMode?: SheetWriteMode;
  createdAt: string;
}

const STORAGE_KEY = 'pending_transactions_v1';

const loadPending = async (): Promise<PendingTransaction[]> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PendingTransaction[]) : [];
  } catch {
    return [];
  }
};

const savePending = async (items: PendingTransaction[]): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
};

export const enqueuePendingTransaction = async (
  transaction: Transaction,
  spreadsheetId: string,
  sheetName: string,
  writeMode?: SheetWriteMode
): Promise<void> => {
  const existing = await loadPending();
  const entry: PendingTransaction = {
    id: `pending_${transaction.id}`,
    transaction,
    spreadsheetId,
    sheetName,
    writeMode,
    createdAt: new Date().toISOString(),
  };
  await savePending([entry, ...existing]);
};

export const flushPendingTransactions = async (): Promise<{
  processed: number;
  remaining: number;
  errors: number;
}> => {
  const pending = await loadPending();
  if (pending.length === 0) {
    return { processed: 0, remaining: 0, errors: 0 };
  }

  const keep: PendingTransaction[] = [];
  let processed = 0;
  let errors = 0;

  for (const item of pending) {
    try {
      await googleSheetsService.appendTransaction(
        item.spreadsheetId,
        item.sheetName,
        item.transaction,
        { writeMode: item.writeMode }
      );
      processed += 1;
    } catch {
      errors += 1;
      keep.push(item);
    }
  }

  if (keep.length !== pending.length) {
    await savePending(keep);
  }

  return { processed, remaining: keep.length, errors };
};
