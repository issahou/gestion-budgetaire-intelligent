import { Transaction, Category, TransactionType } from '../types';

const STORAGE_KEY = 'budgetbuddy_transactions';
let transactions: Transaction[] = [];

function loadFromStorage(): void {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      transactions = JSON.parse(data);
    }
  } catch {
    transactions = [];
  }
}

function saveToStorage(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  } catch {
    // ignore storage errors
  }
}

loadFromStorage();

export async function initDatabase(): Promise<void> {
  return Promise.resolve();
}

export async function addTransaction(transaction: Omit<Transaction, 'id' | 'createdAt'>): Promise<Transaction> {
  const newTransaction: Transaction = {
    ...transaction,
    id: Date.now(),
    createdAt: Date.now(),
  };
  transactions.unshift(newTransaction);
  saveToStorage();
  return newTransaction;
}

export async function getAllTransactions(): Promise<Transaction[]> {
  return [...transactions].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.createdAt - a.createdAt;
  });
}

export async function getTransactionsByDateRange(startDate: string, endDate: string): Promise<Transaction[]> {
  return transactions.filter(t => t.date >= startDate && t.date <= endDate);
}

export async function deleteTransaction(id: number): Promise<void> {
  transactions = transactions.filter(t => t.id !== id);
  saveToStorage();
}

export async function getMonthlyTotals(month: string): Promise<{ income: number; expense: number }> {
  const startDate = `${month}-01`;
  const endDate = `${month}-31`;
  
  let income = 0;
  let expense = 0;
  
  for (const t of transactions) {
    if (t.date >= startDate && t.date <= endDate) {
      if (t.type === 'income') income += t.amount;
      else expense += t.amount;
    }
  }
  
  return { income, expense };
}

export async function getCategoryTotals(month: string): Promise<Record<Category, number>> {
  const startDate = `${month}-01`;
  const endDate = `${month}-31`;
  
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
  
  for (const t of transactions) {
    if (t.date >= startDate && t.date <= endDate && t.type === 'expense') {
      totals[t.category] = (totals[t.category] || 0) + t.amount;
    }
  }
  
  return totals;
}

export async function getHistoricalMonthlyTotals(months: number): Promise<{ month: string; income: number; expense: number }[]> {
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
