# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run start          # Start Expo dev server
npm run ios            # Run on iOS simulator
npm run android        # Run on Android emulator
npm run web            # Run in browser
npm test               # Run Jest tests
npm run test:coverage  # Run tests with coverage
npm run build:ios      # EAS build for iOS production
npm run build:preview  # EAS build for iOS preview
```

## Architecture Overview

**Prism** is a React Native budget tracking app that syncs with Google Sheets.

### Data Flow
```
Google Sheets ←→ googleSheets.ts ←→ budgetStore.ts ←→ UI Components
                      ↓
              transactionSync.ts (offline queue)
```

### Key Directories
- `app/` - Expo Router screens (file-based routing)
  - `(tabs)/` - Main tab screens: Dashboard, Transactions, Reports, Settings
  - `add-transaction.tsx` - Modal for adding transactions
- `src/store/` - Zustand stores with AsyncStorage persistence
- `src/services/` - Google Sheets API, XLSX parsing, sync logic
- `src/components/` - Reusable UI (PieChart, Sparkline, Toast, LoadingOverlay)

### Core Files

| File | Purpose |
|------|---------|
| `src/store/budgetStore.ts` | Central state: transactions, categories, computed reports |
| `src/services/googleSheets.ts` | Google OAuth + Sheets API (read/write) |
| `src/services/xlsxParser.ts` | Parse uploaded Excel/CSV files, detect schema |
| `src/services/transactionSync.ts` | Offline queue for pending writes |
| `src/types/budget.ts` | TypeScript interfaces for all data types |

### State Management Pattern
Zustand stores with persistence middleware:
```typescript
const useStore = create(persist((set, get) => ({
  // state
  // actions: set({...})
  // computed: get().transactions.filter(...)
}), { storage: AsyncStorage }))
```

### Google Sheets Integration
- OAuth via `expo-auth-session`
- Tokens stored in `expo-secure-store` (native) or localStorage (web)
- Supports two write modes: "grid" (monthly expense grids) and "transaction" (append rows)
- Schema auto-detection for date/amount/category columns

## Testing

Tests live in `__tests__/` with mocks in `__tests__/__mocks__/`:
```bash
npm test                           # Run all tests
npm test -- --testPathPattern=reports  # Run specific test file
```

## Palette Convention

Colors are defined as `palette` objects at the top of screen files. Key colors:
- `accent: '#0F766E'` (teal) - Primary action color
- `positive: '#2F9E44'` (green) - Income/success
- `negative: '#D64550'` (red) - Expenses/errors
