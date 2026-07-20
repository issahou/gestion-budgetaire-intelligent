# BudgetBuddy AI

Application mobile de gestion budgétaire personnelle avec intelligence artificielle, développée avec React Native et Expo.

## Fonctionnalités

### Gestion des transactions
- Ajout de revenus et dépenses
- Catégorisation automatique par IA (Alimentation, Transport, Loisirs, Logement, Santé, Éducation, Shopping, Autres)
- Historique complet avec suppression
- Vue par mois avec solde, revenus et dépenses

### Intelligence Artificielle
- **Classification automatique** des dépenses via Groq (LLaMA 3) avec fallback local par mots-clés
- **Prévision budgétaire** par régression linéaire sur 6 mois
- **Conseils financiers personnalisés** avec détection de dépassements, catégories critiques et taux d'épargne

### Interface
- Tableau de bord synthétique
- Navigation par onglets (Accueil, Ajouter, Transactions, IA)
- Design moderne avec support iOS et Android

## Technologies

- **Frontend** : React Native + Expo SDK 54
- **Langage** : TypeScript
- **Base de données** : SQLite via `expo-sqlite`
- **IA** : Groq (LLaMA 3) + algorithmes locaux (keyword matching, régression linéaire, règles heuristiques)
- **Stockage web** : localStorage (fallback pour Expo Web)

## Configuration

### Clé API Groq

Pour activer la classification IA, ajoutez votre clé API Groq dans `app.json` :

```json
{
  "expo": {
    ...
    "extra": {
      "GROQ_API_KEY": "votre_cle_api_groq"
    }
  }
}
```

Vous pouvez également créer un fichier `.env` à la racine du projet :

```
GROQ_API_KEY=votre_cle_api_groq
```

Sans clé API, l'application utilise automatiquement la classification locale par mots-clés.

## Installation

```bash
# Installer les dépendances
npm install

# Lancer en développement
npx expo start
```

Puis :
- Appuyer sur `a` pour Android
- Appuyer sur `i` pour iOS
- Appuyer sur `w` pour Web
- Scanner le QR code avec Expo Go

## Build

```bash
# Export web
npx expo export --platform web

# Export iOS
npx expo export --platform ios

# Export Android
npx expo export --platform android
```

## Structure du projet

```
src/
  db/
    database.ts      # Couche SQLite native
    database.web.ts  # Fallback web (localStorage)
  services/
    ai.ts            # Moteur IA (classification, prévision, conseils)
  types.ts           # Types TypeScript
App.tsx              # Application principale
```

## Scripts

| Commande | Description |
|----------|-------------|
| `npm start` | Lancer Expo Dev Server |
| `npm run android` | Lancer sur Android |
| `npm run ios` | Lancer sur iOS |
| `npm run web` | Lancer sur Web |

## Licence

MIT
