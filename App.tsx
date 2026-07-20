import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { initDatabase, addTransaction, getAllTransactions, getMonthlyTotals, getCategoryTotals, getHistoricalMonthlyTotals } from '@/db/database';
import { Transaction, Category, TransactionType, FinancialAdvice } from '@/types';
import { classifyTransaction, forecastBudget, generateFinancialAdvice } from '@/services/ai';

const CATEGORIES: Category[] = ['Alimentation', 'Transport', 'Loisirs', 'Logement', 'Santé', 'Éducation', 'Shopping', 'Autres', 'Revenu'];
const CATEGORY_ICONS: Record<Category, string> = {
  Alimentation: '🍔',
  Transport: '🚗',
  Loisirs: '🎬',
  Logement: '🏠',
  Santé: '💊',
  Éducation: '📚',
  Shopping: '🛍️',
  Autres: '📦',
  Revenu: '💰',
};

type Screen = 'dashboard' | 'add' | 'transactions' | 'ai';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('dashboard');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      await initDatabase();
      const data = await getAllTransactions();
      setTransactions(data);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddTransaction(transaction: Omit<Transaction, 'id' | 'createdAt'>) {
    try {
      const newTransaction = await addTransaction(transaction);
      setTransactions(prev => [newTransaction, ...prev]);
      setCurrentScreen('dashboard');
    } catch (error) {
      console.error('Failed to add transaction:', error);
    }
  }

  async function handleDeleteTransaction(id: number) {
    try {
      await import('@/db/database').then(m => m.deleteTransaction(id));
      setTransactions(prev => prev.filter(t => t.id !== id));
    } catch (error) {
      console.error('Failed to delete transaction:', error);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={styles.loadingText}>Chargement...</Text>
      </SafeAreaView>
    );
  }

  const renderScreen = () => {
    switch (currentScreen) {
      case 'dashboard':
        return <DashboardScreen transactions={transactions} currentMonth={currentMonth} onNavigate={setCurrentScreen} />;
      case 'add':
        return <AddTransactionScreen onAdd={handleAddTransaction} onCancel={() => setCurrentScreen('dashboard')} />;
      case 'transactions':
        return <TransactionsScreen transactions={transactions} onDelete={handleDeleteTransaction} onBack={() => setCurrentScreen('dashboard')} />;
      case 'ai':
        return <AIScreen transactions={transactions} currentMonth={currentMonth} onBack={() => setCurrentScreen('dashboard')} />;
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      {renderScreen()}
      <BottomNav currentScreen={currentScreen} onNavigate={setCurrentScreen} />
    </SafeAreaView>
  );
}

function DashboardScreen({ transactions, currentMonth, onNavigate }: { 
  transactions: Transaction[]; 
  currentMonth: string; 
  onNavigate: (screen: Screen) => void; 
}) {
  const [totals, setTotals] = useState({ income: 0, expense: 0 });
  const [categoryTotals, setCategoryTotals] = useState<Record<Category, number>>({
    Alimentation: 0, Transport: 0, Loisirs: 0, Logement: 0, Santé: 0, Éducation: 0, Shopping: 0, Autres: 0, Revenu: 0,
  });

  useEffect(() => {
    async function load() {
      const [mTotals, cTotals] = await Promise.all([
        getMonthlyTotals(currentMonth),
        getCategoryTotals(currentMonth),
      ]);
      setTotals(mTotals);
      setCategoryTotals(cTotals);
    }
    load();
  }, [currentMonth, transactions]);

  const balance = totals.income - totals.expense;
  const recentTransactions = transactions.slice(0, 5);

  const topCategories = Object.entries(categoryTotals)
    .filter(([cat]) => cat !== 'Revenu')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <ScrollView style={styles.screenContent} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>BudgetBuddy AI</Text>
        <Text style={styles.headerSubtitle}>Tableau de bord</Text>
      </View>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Solde actuel</Text>
        <Text style={[styles.balanceAmount, { color: balance >= 0 ? '#059669' : '#DC2626' }]}>
          {balance.toFixed(2)}€
        </Text>
        <View style={styles.balanceRow}>
          <View style={styles.balanceItem}>
            <Text style={styles.balanceItemLabel}>Revenus</Text>
            <Text style={[styles.balanceItemValue, { color: '#059669' }]}>+{totals.income.toFixed(2)}€</Text>
          </View>
          <View style={styles.balanceDivider} />
          <View style={styles.balanceItem}>
            <Text style={styles.balanceItemLabel}>Dépenses</Text>
            <Text style={[styles.balanceItemValue, { color: '#DC2626' }]}>-{totals.expense.toFixed(2)}€</Text>
          </View>
        </View>
      </View>

      {topCategories.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top catégories</Text>
          {topCategories.map(([category, amount], index) => (
            <View key={category} style={styles.categoryRow}>
              <View style={styles.categoryLeft}>
                <Text style={styles.categoryIcon}>{CATEGORY_ICONS[category as Category]}</Text>
                <Text style={styles.categoryName}>{category}</Text>
              </View>
              <Text style={styles.categoryAmount}>{amount.toFixed(2)}€</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Transactions récentes</Text>
        {recentTransactions.length === 0 ? (
          <Text style={styles.emptyText}>Aucune transaction ce mois</Text>
        ) : (
          recentTransactions.map(t => (
            <View key={t.id} style={styles.transactionRow}>
              <View style={styles.transactionLeft}>
                <Text style={styles.categoryIcon}>{CATEGORY_ICONS[t.category]}</Text>
                <View>
                  <Text style={styles.transactionDesc}>{t.description}</Text>
                  <Text style={styles.transactionMeta}>{t.category} • {t.date}</Text>
                </View>
              </View>
              <Text style={[styles.transactionAmount, { color: t.type === 'income' ? '#059669' : '#DC2626' }]}>
                {t.type === 'income' ? '+' : '-'}{t.amount.toFixed(2)}€
              </Text>
            </View>
          ))
        )}
        {transactions.length > 5 && (
          <TouchableOpacity onPress={() => onNavigate('transactions')} style={styles.viewAllButton}>
            <Text style={styles.viewAllText}>Voir tout</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity onPress={() => onNavigate('ai')} style={styles.aiButton}>
        <Text style={styles.aiButtonText}>🤖 Conseils IA</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function AddTransactionScreen({ onAdd, onCancel }: { 
  onAdd: (t: Omit<Transaction, 'id' | 'createdAt'>) => void; 
  onCancel: () => void; 
}) {
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('Autres');
  const [date, setDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [classifying, setClassifying] = useState(false);
  const [classifiedCategory, setClassifiedCategory] = useState<Category | null>(null);

  const handleSubmit = async () => {
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      Alert.alert('Erreur', 'Veuillez entrer un montant valide');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer une description');
      return;
    }

    setClassifying(true);
    try {
      const result = await classifyTransaction(description.trim());
      
      if (!result) {
        Alert.alert('Erreur', 'La classification IA a échoué. Veuillez sélectionner une catégorie manuellement.');
        return;
      }
      
      setCategory(result);
      setClassifiedCategory(result);
      
      onAdd({
        type,
        amount: parsedAmount,
        category: result,
        description: description.trim(),
        date,
      });
      
      setAmount('');
      setDescription('');
      setClassifiedCategory(null);
    } catch (error) {
      console.error('Classification failed:', error);
      Alert.alert('Erreur', 'La classification a échoué. Veuillez réessayer.');
    } finally {
      setClassifying(false);
    }
  };

  return (
    <ScrollView style={styles.screenContent} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.screenTitle}>Nouvelle transaction</Text>

      <View style={styles.typeSelector}>
        <TouchableOpacity
          style={[styles.typeButton, type === 'expense' && styles.typeButtonActive]}
          onPress={() => setType('expense')}
        >
          <Text style={[styles.typeButtonText, type === 'expense' && styles.typeButtonTextActive]}>Dépense</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.typeButton, type === 'income' && styles.typeButtonActive]}
          onPress={() => setType('income')}
        >
          <Text style={[styles.typeButtonText, type === 'income' && styles.typeButtonTextActive]}>Revenu</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Montant (€)</Text>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          keyboardType="numeric"
          autoFocus
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={styles.input}
          value={description}
          onChangeText={setDescription}
          placeholder="Ex: Courses au supermarché"
          autoCapitalize="none"
        />
        {classifiedCategory && (
          <Text style={styles.aiHint}>
            💡 Catégorie: {CATEGORY_ICONS[classifiedCategory]} {classifiedCategory} 
            <Text style={styles.sourceBadge}> (IA Groq)</Text>
          </Text>
        )}
      </View>

      {type === 'expense' && (
        <View style={styles.formGroup}>
          <Text style={styles.label}>Catégorie</Text>
          <View style={styles.categoryGrid}>
            {CATEGORIES.filter(c => c !== 'Revenu').map(cat => (
              <TouchableOpacity
                key={cat}
                style={[styles.categoryChip, category === cat && styles.categoryChipActive]}
                onPress={() => setCategory(cat)}
              >
                <Text style={styles.categoryChipIcon}>{CATEGORY_ICONS[cat]}</Text>
                <Text style={[styles.categoryChipText, category === cat && styles.categoryChipTextActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <View style={styles.formGroup}>
        <Text style={styles.label}>Date</Text>
        <TextInput
          style={styles.input}
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
        />
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelButtonText}>Annuler</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} disabled={classifying}>
          <Text style={styles.submitButtonText}>{classifying ? 'Classification...' : 'Ajouter'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function TransactionsScreen({ transactions, onDelete, onBack }: {
  transactions: Transaction[];
  onDelete: (id: number) => void;
  onBack: () => void;
}) {
  const handleDelete = (id: number, description: string) => {
    Alert.alert('Supprimer', `Supprimer "${description}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => onDelete(id) },
    ]);
  };

  return (
    <ScrollView style={styles.screenContent} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backButton}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Toutes les transactions</Text>
      </View>

      {transactions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Aucune transaction enregistrée</Text>
        </View>
      ) : (
        transactions.map(t => (
          <View key={t.id} style={styles.transactionCard}>
            <View style={styles.transactionCardLeft}>
              <Text style={styles.categoryIcon}>{CATEGORY_ICONS[t.category]}</Text>
              <View>
                <Text style={styles.transactionDesc}>{t.description}</Text>
                <Text style={styles.transactionMeta}>{t.category} • {t.date}</Text>
              </View>
            </View>
            <View style={styles.transactionCardRight}>
              <Text style={[styles.transactionAmount, { color: t.type === 'income' ? '#059669' : '#DC2626' }]}>
                {t.type === 'income' ? '+' : '-'}{t.amount.toFixed(2)}€
              </Text>
              <TouchableOpacity onPress={() => handleDelete(t.id, t.description)}>
                <Text style={styles.deleteButton}>🗑️</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

function AIScreen({ transactions, currentMonth, onBack }: {
  transactions: Transaction[];
  currentMonth: string;
  onBack: () => void;
}) {
  const [forecast, setForecast] = useState<{ predictedExpense: number; predictedIncome: number; confidence: number } | null>(null);
  const [advice, setAdvice] = useState<FinancialAdvice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function analyze() {
      try {
        const [historical, monthlyTotals, categoryTotals] = await Promise.all([
          getHistoricalMonthlyTotals(6),
          getMonthlyTotals(currentMonth),
          getCategoryTotals(currentMonth),
        ]);
        
        const forecastResult = forecastBudget(historical, currentMonth);
        setForecast(forecastResult);
        
        const adviceResult = generateFinancialAdvice(transactions, monthlyTotals, categoryTotals);
        setAdvice(adviceResult);
      } catch (error) {
        console.error('AI analysis failed:', error);
      } finally {
        setLoading(false);
      }
    }
    analyze();
  }, [transactions, currentMonth]);

  if (loading) {
    return (
      <ScrollView style={styles.screenContent} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack}>
            <Text style={styles.backButton}>← Retour</Text>
          </TouchableOpacity>
          <Text style={styles.screenTitle}>Conseils IA</Text>
        </View>
        <ActivityIndicator size="large" color="#4F46E5" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screenContent} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backButton}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Conseils IA</Text>
      </View>

      {forecast && (
        <View style={styles.aiCard}>
          <Text style={styles.aiCardTitle}>📈 Prévision budgétaire</Text>
          <View style={styles.forecastRow}>
            <View style={styles.forecastItem}>
              <Text style={styles.forecastLabel}>Dépenses prévues</Text>
              <Text style={[styles.forecastValue, { color: '#DC2626' }]}>{forecast.predictedExpense.toFixed(2)}€</Text>
            </View>
            <View style={styles.forecastDivider} />
            <View style={styles.forecastItem}>
              <Text style={styles.forecastLabel}>Revenus prévus</Text>
              <Text style={[styles.forecastValue, { color: '#059669' }]}>{forecast.predictedIncome.toFixed(2)}€</Text>
            </View>
          </View>
          <View style={styles.confidenceRow}>
            <Text style={styles.confidenceLabel}>Confiance:</Text>
            <View style={styles.confidenceBar}>
              <View style={[styles.confidenceFill, { width: `${forecast.confidence * 100}%` }]} />
            </View>
            <Text style={styles.confidenceText}>{(forecast.confidence * 100).toFixed(0)}%</Text>
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Conseils personnalisés</Text>
        {advice.length === 0 ? (
          <Text style={styles.emptyText}>Ajoutez plus de transactions pour obtenir des conseils.</Text>
        ) : (
          advice.map(item => (
            <View key={item.id} style={[styles.adviceCard, { borderLeftColor: item.priority === 'high' ? '#DC2626' : item.priority === 'medium' ? '#F59E0B' : '#4F46E5' }]}>
              <Text style={styles.adviceTitle}>{item.title}</Text>
              <Text style={styles.adviceMessage}>{item.message}</Text>
              <View style={[styles.priorityBadge, { backgroundColor: item.priority === 'high' ? '#FEE2E2' : item.priority === 'medium' ? '#FEF3C7' : '#E0E7FF' }]}>
                <Text style={[styles.priorityText, { color: item.priority === 'high' ? '#DC2626' : item.priority === 'medium' ? '#F59E0B' : '#4F46E5' }]}>
                  {item.priority === 'high' ? 'Priorité haute' : item.priority === 'medium' ? 'Moyenne' : 'Info'}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function BottomNav({ currentScreen, onNavigate }: { currentScreen: Screen; onNavigate: (screen: Screen) => void }) {
  const navItems: { screen: Screen; label: string; icon: string }[] = [
    { screen: 'dashboard', label: 'Accueil', icon: '🏠' },
    { screen: 'add', label: 'Ajouter', icon: '➕' },
    { screen: 'transactions', label: 'Transactions', icon: '📋' },
    { screen: 'ai', label: 'IA', icon: '🤖' },
  ];

  return (
    <View style={styles.bottomNav}>
      {navItems.map(item => (
        <TouchableOpacity
          key={item.screen}
          style={styles.navItem}
          onPress={() => onNavigate(item.screen)}
        >
          <Text style={[styles.navIcon, currentScreen === item.screen && styles.navIconActive]}>
            {item.icon}
          </Text>
          <Text style={[styles.navLabel, currentScreen === item.screen && styles.navLabelActive]}>
            {item.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  screenContent: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 80,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748B',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
    backgroundColor: '#4F46E5',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#E0E7FF',
    marginTop: 2,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 16,
  },
  backButton: {
    color: '#FFFFFF',
    fontSize: 14,
    marginBottom: 8,
  },
  balanceCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: 20,
    padding: 24,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  balanceLabel: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 4,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  balanceItem: {
    flex: 1,
  },
  balanceItemLabel: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 4,
  },
  balanceItemValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  balanceDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 16,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 12,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1E293B',
  },
  categoryAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4F46E5',
  },
  transactionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  transactionDesc: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1E293B',
  },
  transactionMeta: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  transactionAmount: {
    fontSize: 14,
    fontWeight: '600',
  },
  transactionCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  transactionCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  transactionCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deleteButton: {
    fontSize: 18,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
  },
  viewAllButton: {
    marginTop: 8,
    alignItems: 'center',
    paddingVertical: 8,
  },
  viewAllText: {
    color: '#4F46E5',
    fontWeight: '600',
  },
  aiButton: {
    backgroundColor: '#4F46E5',
    marginHorizontal: 20,
    marginTop: 24,
    marginBottom: 20,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  aiButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 8,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  navIcon: {
    fontSize: 20,
    opacity: 0.5,
  },
  navIconActive: {
    opacity: 1,
  },
  navLabel: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  navLabelActive: {
    color: '#4F46E5',
    fontWeight: '600',
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  typeButton: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  typeButtonActive: {
    backgroundColor: '#4F46E5',
  },
  typeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748B',
  },
  typeButtonTextActive: {
    color: '#FFFFFF',
  },
  formGroup: {
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#1E293B',
  },
  aiHint: {
    marginTop: 8,
    fontSize: 13,
    color: '#4F46E5',
    fontStyle: 'italic',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  categoryChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
  },
  categoryChipIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  categoryChipText: {
    fontSize: 13,
    color: '#64748B',
  },
  categoryChipTextActive: {
    color: '#4F46E5',
    fontWeight: '600',
  },
  sourceBadge: {
    fontSize: 12,
    color: '#64748B',
    fontStyle: 'italic',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    marginTop: 10,
  },
  cancelButton: {
    flex: 1,
    padding: 16,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748B',
  },
  submitButton: {
    flex: 1,
    padding: 16,
    borderRadius: 10,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  aiCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  aiCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 16,
  },
  forecastRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  forecastItem: {
    flex: 1,
  },
  forecastLabel: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 4,
  },
  forecastValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  forecastDivider: {
    width: 1,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 16,
  },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  confidenceLabel: {
    fontSize: 13,
    color: '#64748B',
  },
  confidenceBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  confidenceFill: {
    height: '100%',
    backgroundColor: '#4F46E5',
    borderRadius: 4,
  },
  confidenceText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4F46E5',
    width: 36,
  },
  adviceCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  adviceTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 6,
  },
  adviceMessage: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
    marginBottom: 10,
  },
  priorityBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  priorityText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
