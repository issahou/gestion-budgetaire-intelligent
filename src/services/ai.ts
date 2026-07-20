import Constants from 'expo-constants';
import { Category, Transaction, FinancialAdvice } from '../types';

const CATEGORIES: Category[] = ['Alimentation', 'Transport', 'Loisirs', 'Logement', 'Santé', 'Éducation', 'Shopping', 'Autres', 'Revenu'];

export async function classifyWithGroq(description: string): Promise<Category | null> {
  const apiKey = Constants.expoConfig?.extra?.GROQ_API_KEY;
  
  if (!apiKey || apiKey.trim().length === 0) {
    console.log('[Groq] No API key configured');
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

export function forecastBudget(historicalData: { month: string; expense: number; income: number }[], targetMonth: string): { predictedExpense: number; predictedIncome: number; confidence: number } {
  if (historicalData.length === 0) {
    return { predictedExpense: 0, predictedIncome: 0, confidence: 0 };
  }

  const n = historicalData.length;
  const recent = historicalData.slice(-6);
  
  if (recent.length === 1) {
    return {
      predictedExpense: recent[0].expense,
      predictedIncome: recent[0].income,
      confidence: 0.3,
    };
  }

  const expenses = recent.map(d => d.expense);
  const incomes = recent.map(d => d.income);
  
  const predictedExpense = calculateLinearTrend(expenses);
  const predictedIncome = calculateLinearTrend(incomes);
  
  const expenseVariance = calculateVariance(expenses);
  const avgExpense = expenses.reduce((a, b) => a + b, 0) / expenses.length;
  const confidence = avgExpense > 0 ? Math.max(0.2, Math.min(0.9, 1 - (expenseVariance / (avgExpense * avgExpense)))) : 0.5;
  
  return {
    predictedExpense: Math.max(0, predictedExpense),
    predictedIncome: Math.max(0, predictedIncome),
    confidence: Math.round(confidence * 100) / 100,
  };
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

export function generateFinancialAdvice(
  transactions: Transaction[],
  monthlyTotals: { income: number; expense: number },
  categoryTotals: Record<string, number>
): FinancialAdvice[] {
  const advice: FinancialAdvice[] = [];
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  if (monthlyTotals.expense > monthlyTotals.income && monthlyTotals.income > 0) {
    advice.push({
      id: 'overspending',
      title: 'Dépenses excessives',
      message: `Vos dépenses (${monthlyTotals.expense.toFixed(0)}€) dépassent vos revenus (${monthlyTotals.income.toFixed(0)}€) ce mois. Essayez de réduire les dépenses non essentielles.`,
      priority: 'high',
    });
  }
  
  const topCategory = Object.entries(categoryTotals)
    .filter(([cat]) => cat !== 'Revenu')
    .sort((a, b) => b[1] - a[1])[0];
  
  if (topCategory && topCategory[1] > monthlyTotals.income * 0.4) {
    advice.push({
      id: 'category-alert',
      title: `Fortes dépenses en ${topCategory[0]}`,
      message: `Vous avez dépensé ${topCategory[1].toFixed(0)}€ en ${topCategory[0].toLowerCase()}, soit plus de 40% de vos revenus. Examinez ces dépenses pour identifier des économies possibles.`,
      priority: 'medium',
      category: topCategory[0] as Category,
    });
  }
  
  const recentTransactions = transactions
    .filter(t => t.type === 'expense')
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 20);
  
  const frequentCategories = new Map<string, number>();
  for (const t of recentTransactions) {
    frequentCategories.set(t.category, (frequentCategories.get(t.category) || 0) + 1);
  }
  
  const sortedFrequent = Array.from(frequentCategories.entries()).sort((a, b) => b[1] - a[1]);
  
  if (sortedFrequent.length > 0 && sortedFrequent[0][1] >= 5) {
    advice.push({
      id: 'frequent-spending',
      title: `Dépenses fréquentes en ${sortedFrequent[0][0]}`,
      message: `Vous avez effectué ${sortedFrequent[0][1]} transactions en ${sortedFrequent[0][0].toLowerCase()} récemment. Envisagez un budget mensuel pour cette catégorie.`,
      priority: 'low',
      category: sortedFrequent[0][0] as Category,
    });
  }
  
  if (monthlyTotals.income > 0 && monthlyTotals.expense < monthlyTotals.income * 0.7) {
    const savingsRate = ((monthlyTotals.income - monthlyTotals.expense) / monthlyTotals.income) * 100;
    advice.push({
      id: 'good-savings',
      title: 'Bon taux d\'épargne',
      message: `Excellent ! Votre taux d'épargne est de ${savingsRate.toFixed(0)}% ce mois. Continuez ainsi pour atteindre vos objectifs financiers.`,
      priority: 'low',
    });
  }
  
  if (transactions.length < 5) {
    advice.push({
      id: 'more-data',
      title: 'Ajoutez plus de transactions',
      message: 'Ajoutez plus de transactions pour obtenir des prévisions et conseils plus précis.',
      priority: 'medium',
    });
  }
  
  const uncategorized = transactions.filter(t => t.category === 'Autres').length;
  if (uncategorized > transactions.length * 0.3 && transactions.length > 0) {
    advice.push({
      id: 'categorize',
      title: 'Catégorisez vos transactions',
      message: `${uncategorized} transactions sont dans "Autres". Utilisez la classification automatique pour mieux organiser vos finances.`,
      priority: 'medium',
    });
  }
  
  return advice;
}
