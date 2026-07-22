import Constants from 'expo-constants';
import { Category, Transaction, FinancialAdvice, BudgetForecast, UserBudget } from '../types';

const CATEGORIES: Category[] = ['Alimentation', 'Transport', 'Loisirs', 'Logement', 'Santé', 'Éducation', 'Shopping', 'Autres', 'Revenu'];

const NEEDS_CATEGORIES: Category[] = ['Alimentation', 'Logement', 'Transport', 'Santé'];
const WANTS_CATEGORIES: Category[] = ['Loisirs', 'Shopping', 'Éducation'];

export async function classifyWithGroq(description: string): Promise<Category | null> {
  const apiKey = Constants.expoConfig?.extra?.GROQ_API_KEY;
  
  if (!apiKey || apiKey.trim().length === 0) {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'user',
            content: `Classifie cette transaction financière dans une seule catégorie parmi: ${CATEGORIES.join(', ')}.\nDescription: "${description}"\nRéponds uniquement par le nom exact de la catégorie.`,
          },
        ],
        max_tokens: 20,
        temperature: 0,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const rawText = data.choices?.[0]?.message?.content?.trim() || '';
    
    let text = rawText
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`/g, '')
      .replace(/["'«»]/g, '')
      .split('\n')[0]
      .trim();
    
    const normalizedText = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    const matchedCategory = CATEGORIES.find(c => {
      const normalizedCategory = c.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return normalizedText === normalizedCategory || normalizedText.includes(normalizedCategory);
    });
    
    if (matchedCategory) {
      return matchedCategory;
    }
    
    return null;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

export async function classifyTransaction(description: string): Promise<Category | null> {
  return classifyWithGroq(description);
}

export function forecastBudget(
  historicalData: { month: string; expense: number; income: number }[],
  targetMonth: string,
  currentMonthTotals: { income: number; expense: number },
  userBudgets?: UserBudget[],
  categoryTotals?: Record<string, number>,
  knownTransactions?: Transaction[]
): BudgetForecast {
  const now = new Date();
  const [year, month] = targetMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysElapsed = Math.min(now.getDate(), daysInMonth);
  const daysRemaining = daysInMonth - daysElapsed;
  const monthProgress = daysInMonth > 0 ? daysElapsed / daysInMonth : 1;

  const hasCurrentMonthData = currentMonthTotals.income > 0 || currentMonthTotals.expense > 0;
  const hasHistoricalData = historicalData.length > 0;

  if (!hasCurrentMonthData && !hasHistoricalData) {
    return {
      month: targetMonth,
      predictedExpense: 0,
      predictedIncome: 0,
      confidence: 0,
      source: 'none',
    };
  }

  const hasBudgets = userBudgets && userBudgets.length > 0;
  const expenseBudget = hasBudgets
    ? userBudgets
        .filter(b => b.category !== 'Revenu')
        .reduce((sum, b) => sum + b.amount, 0)
    : 0;
  const incomeBudget = hasBudgets
    ? userBudgets.find(b => b.category === 'Revenu')?.amount || 0
    : 0;
  const hasEnoughBudgets = hasBudgets && userBudgets.filter(b => b.category !== 'Revenu').length >= 3;

  const completedHistory = buildCompletedHistory(historicalData, targetMonth, 6, userBudgets, knownTransactions);
  const nonZeroMonths = completedHistory.filter(d => d.expense > 0 || d.income > 0);
  const hasEnoughHistory = nonZeroMonths.length >= 3;

  let predictedIncome: number;
  let predictedExpense: number;
  let confidenceBase: number;
  let source: 'trend' | 'heuristic';

  if (hasEnoughHistory) {
    const recent = completedHistory.slice(-6);
    const expenses = recent.map(d => d.expense);
    const incomes = recent.map(d => d.income);

    predictedExpense = calculateLinearTrend(expenses);
    predictedIncome = calculateLinearTrend(incomes);

    const expenseVariance = calculateVariance(expenses);
    const avgExpense = expenses.reduce((a, b) => a + b, 0) / expenses.length;
    confidenceBase = avgExpense > 0 ? Math.max(0.2, Math.min(0.9, 1 - (expenseVariance / (avgExpense * avgExpense)))) : 0.5;
    source = 'trend';
  } else {
    const totalIncome = completedHistory.reduce((sum, d) => sum + d.income, 0);
    predictedIncome = totalIncome / Math.max(completedHistory.length, 1);
    predictedExpense = predictedIncome * 0.8;
    confidenceBase = 0.4;
    source = 'heuristic';
  }

  if (hasCurrentMonthData && currentMonthTotals.expense > 0) {
    const actualSpending = currentMonthTotals.expense;
    const dailySpendingRate = actualSpending / daysElapsed;
    const projectedRemaining = dailySpendingRate * daysRemaining;
    const projectedTotal = actualSpending + projectedRemaining;
    predictedExpense = Math.max(predictedExpense, projectedTotal);
  }

  if (hasBudgets && expenseBudget > 0 && !hasEnoughBudgets) {
    predictedExpense = Math.min(predictedExpense, expenseBudget);
  }

  return {
    month: targetMonth,
    predictedExpense: Math.max(0, predictedExpense),
    predictedIncome: Math.max(0, predictedIncome),
    confidence: Math.round(Math.min(0.99, confidenceBase * monthProgress) * 100) / 100,
    source,
  };
}

function generateSyntheticMonthlyData(
  targetMonth: string,
  userBudgets?: UserBudget[],
  knownTransactions?: Transaction[]
): { expense: number; income: number } {
  const expenseBudget = userBudgets
    ?.filter(b => b.category !== 'Revenu')
    .reduce((sum, b) => sum + b.amount, 0) || 0;
  const incomeBudget = userBudgets?.find(b => b.category === 'Revenu')?.amount || 0;

  const variation = () => 0.85 + Math.random() * 0.3;

  if (expenseBudget > 0 || incomeBudget > 0) {
    return {
      expense: expenseBudget > 0 ? expenseBudget * variation() : 0,
      income: incomeBudget > 0 ? incomeBudget * variation() : expenseBudget * 1.5 * variation(),
    };
  }

  if (knownTransactions && knownTransactions.length > 0) {
    const avgExpense =
      knownTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0) /
      Math.max(knownTransactions.filter(t => t.type === 'expense').length, 1);
    const avgIncome =
      knownTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0) /
      Math.max(knownTransactions.filter(t => t.type === 'income').length, 1);

    return {
      expense: avgExpense > 0 ? avgExpense * (0.8 + Math.random() * 0.4) : 0,
      income: avgIncome > 0 ? avgIncome * (0.8 + Math.random() * 0.4) : 0,
    };
  }

  return { expense: 2000 * variation(), income: 3000 * variation() };
}

function buildCompletedHistory(
  realHistory: { month: string; expense: number; income: number }[],
  targetMonth: string,
  monthsBack: number,
  userBudgets?: UserBudget[],
  knownTransactions?: Transaction[]
): { month: string; expense: number; income: number }[] {
  const result: { month: string; expense: number; income: number }[] = [];
  const [year, month] = targetMonth.split('-').map(Number);

  const realByMonth = new Map(
    realHistory.filter(d => d.expense > 0 || d.income > 0).map(d => [d.month, d])
  );

  for (let i = monthsBack; i >= 1; i--) {
    const date = new Date(year, month - i, 1);
    const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const real = realByMonth.get(monthStr);

    if (real) {
      result.push({ month: monthStr, expense: real.expense, income: real.income });
    } else {
      const synthetic = generateSyntheticMonthlyData(monthStr, userBudgets, knownTransactions);
      result.push({ month: monthStr, ...synthetic });
    }
  }

  return result;
}

function calculateLinearTrend(values: number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  if (n === 1) return values[0];
  
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  
  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) {
    return sumY / n;
  }
  
  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  
  return intercept + slope * n;
}

function calculateVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
}

const ADVICE_CACHE = new Map<string, { advice: FinancialAdvice[]; timestamp: number }>();
const ADVICE_CACHE_TTL = 60 * 60 * 1000;

export async function generateGroqAdvice(
  monthlyTotals: { income: number; expense: number },
  categoryTotals: Record<string, number>,
  historicalData: { month: string; expense: number; income: number }[]
): Promise<FinancialAdvice[]> {
  const cacheKey = `${monthlyTotals.income}-${monthlyTotals.expense}-${JSON.stringify(categoryTotals)}`;
  const cached = ADVICE_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < ADVICE_CACHE_TTL) {
    return cached.advice;
  }

  const apiKey = Constants.expoConfig?.extra?.GROQ_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    console.error('[Groq] No API key configured');
    return [];
  }

  const topCategories = Object.entries(categoryTotals)
    .filter(([cat]) => cat !== 'Revenu')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const previousMonth = historicalData.length >= 2 ? historicalData[historicalData.length - 2] : null;
  const expenseTrend = previousMonth
    ? ((monthlyTotals.expense - previousMonth.expense) / previousMonth.expense) * 100
    : 0;

  const hasCurrentMonthData = monthlyTotals.income > 0 || monthlyTotals.expense > 0;
  const historicalSummary = historicalData.slice(-6).map(d => `${d.month}: ${d.income}€ revenus, ${d.expense}€ dépenses`).join('\n');

  const prompt = `Tu es un conseiller financier expert. Génère exactement 3 conseils personnalisés basés sur ces données:
${hasCurrentMonthData ? `- Revenus ce mois: ${monthlyTotals.income.toFixed(0)}€
- Dépenses ce mois: ${monthlyTotals.expense.toFixed(0)}€
- Solde: ${(monthlyTotals.income - monthlyTotals.expense).toFixed(0)}€` : '- Aucune transaction ce mois, utilise l\'historique ci-dessous'}
- Tendance des dépenses: ${expenseTrend >= 0 ? '+' : ''}${expenseTrend.toFixed(0)}% vs mois dernier
- Top catégories de dépenses: ${topCategories.map(([cat, amount]) => `${cat}: ${amount.toFixed(0)}€`).join(', ')}
${historicalData.length > 0 ? `- Historique récent:\n${historicalSummary}` : ''}

Règles:
1. Si les dépenses dépassent les revenus, priorise un conseil de réduction urgente
2. Si une catégorie dépasse 40% des revenus, suggère des économies spécifiques
3. Si le solde est positif, encourage à épargner davantage
4. Les conseils doivent être actionnables et précis
5. Si aucune donnée du mois courant, base-toi sur l'historique pour donner des conseils pertinents

Format JSON strict (pas de markdown):
[{"title":"...","message":"...","priority":"high|medium|low"}]`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const rawText = data.choices?.[0]?.message?.content?.trim() || '';

    let jsonText = rawText
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    const jsonMatch = jsonText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]) as { title: string; message: string; priority: string }[];
    
    const advice: FinancialAdvice[] = parsed.map((item, index) => ({
      id: `groq-advice-${Date.now()}-${index}`,
      title: item.title || 'Conseil',
      message: item.message || '',
      priority: (['high', 'medium', 'low'].includes(item.priority) ? item.priority : 'medium') as FinancialAdvice['priority'],
      source: 'groq' as const,
    }));

    ADVICE_CACHE.set(cacheKey, { advice, timestamp: Date.now() });
    return advice;
  } catch {
    clearTimeout(timeoutId);
    return [];
  }
}

export function generateFinancialAdvice(
  transactions: Transaction[],
  monthlyTotals: { income: number; expense: number },
  categoryTotals: Record<string, number>
): FinancialAdvice[] {
  return [];
}
