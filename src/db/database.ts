import { openDatabaseAsync } from 'expo-sqlite';
import { Transaction, Category, TransactionType } from '../types';

const DB_NAME = 'budgetbuddy.db';

let dbPromise: ReturnType<typeof openDatabaseAsync> | null = null;

async function getDb() {
  if (!dbPromise) {
    dbPromise = openDatabaseAsync(DB_NAME);
  }
  return dbPromise;
}

export async function initDatabase() {
  const db = await getDb();
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      date TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
  `);
}

export async function addTransaction(transaction: Omit<Transaction, 'id' | 'createdAt'>): Promise<Transaction> {
  const db = await getDb();
  const result = await db.runAsync(
    'INSERT INTO transactions (type, amount, category, description, date, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
    [transaction.type, transaction.amount, transaction.category, transaction.description, transaction.date, Date.now()]
  );
  return {
    ...transaction,
    id: result.lastInsertRowId,
    createdAt: Date.now(),
  };
}

export async function getAllTransactions(): Promise<Transaction[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Transaction>('SELECT * FROM transactions ORDER BY date DESC, createdAt DESC');
  return rows;
}

export async function getTransactionsByDateRange(startDate: string, endDate: string): Promise<Transaction[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Transaction>(
    'SELECT * FROM transactions WHERE date >= ? AND date <= ? ORDER BY date DESC',
    [startDate, endDate]
  );
  return rows;
}

export async function deleteTransaction(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM transactions WHERE id = ?', [id]);
}

export async function getMonthlyTotals(month: string): Promise<{ income: number; expense: number }> {
  const db = await getDb();
  const startDate = `${month}-01`;
  const endDate = `${month}-31`;
  
  const incomeRow = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = ? AND date >= ? AND date <= ?',
    ['income', startDate, endDate]
  );
  
  const expenseRow = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = ? AND date >= ? AND date <= ?',
    ['expense', startDate, endDate]
  );
  
  return {
    income: incomeRow?.total || 0,
    expense: expenseRow?.total || 0,
  };
}

export async function getCategoryTotals(month: string): Promise<Record<Category, number>> {
  const db = await getDb();
  const startDate = `${month}-01`;
  const endDate = `${month}-31`;
  
  const rows = await db.getAllAsync<{ category: string; total: number }>(
    'SELECT category, COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = ? AND date >= ? AND date <= ? GROUP BY category',
    ['expense', startDate, endDate]
  );
  
  const totals: Record<Category, number> = {
    Alimentation: 0,
    Transport: 0,
    Loisirs: 0,
    Logement: 0,
    Santé: 0,
    Éducation: 0,
    Shopping: 0,
    Autres: 0,
    Revenu: 0,
  };
  
  for (const row of rows) {
    if (row.category in totals) {
      totals[row.category as Category] = row.total;
    }
  }
  
  return totals;
}

export async function getHistoricalMonthlyTotals(months: number): Promise<{ month: string; income: number; expense: number }[]> {
  const db = await getDb();
  const results: { month: string; income: number; expense: number }[] = [];
  
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    const totals = await getMonthlyTotals(monthStr);
    results.push({
      month: monthStr,
      income: totals.income,
      expense: totals.expense,
    });
  }
  
  return results;
}
