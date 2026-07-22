export type Category = 'Alimentation' | 'Transport' | 'Loisirs' | 'Logement' | 'Santé' | 'Éducation' | 'Shopping' | 'Autres' | 'Revenu';

export type TransactionType = 'income' | 'expense';

export interface Transaction {
  id: number;
  type: TransactionType;
  amount: number;
  category: Category;
  description: string;
  date: string;
  createdAt: number;
}

export interface BudgetForecast {
  month: string;
  predictedExpense: number;
  predictedIncome: number;
  confidence: number;
  source: 'none' | 'heuristic' | 'trend';
}

export interface FinancialAdvice {
  id: string;
  title: string;
  message: string;
  priority: 'high' | 'medium' | 'low';
  category?: Category;
  source?: 'groq' | 'rule';
}

export interface UserBudget {
  id?: number;
  category: Category;
  amount: number;
  month: string;
}
