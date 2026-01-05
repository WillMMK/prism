# Prism Design Roadmap

## Immediate: Theme System Implementation

### Overview
Create a centralized theme system with React Context that enables light/dark mode switching, reading from the existing `settingsStore.theme` setting.

### Current State
- `src/theme/palette.ts` exists with `lightPalette` and `darkPalette`
- `src/store/settingsStore.ts` has `theme: 'light' | 'dark' | 'system'` state
- No ThemeProvider/Context to connect settings to UI
- All screens have local `palette` objects hardcoded to light mode
- Tab bar uses dark colors that don't match light screens

### Implementation Steps

**Phase 1: Create Theme Infrastructure**
1. Create `src/theme/ThemeContext.tsx` - Provider with useTheme() hook
2. Create `src/theme/spacing.ts` - Spacing scale and border radius constants
3. Create `src/theme/typography.ts` - Font sizes, weights, line heights
4. Create `src/theme/index.ts` - Barrel export

**Phase 2: Integrate into App**
1. Update `app/_layout.tsx` - Wrap with ThemeProvider
2. Update `app/(tabs)/_layout.tsx` - Theme-aware tab bar

**Phase 3: Migrate Screens**
- `app/(tabs)/index.tsx` - Dashboard
- `app/(tabs)/transactions.tsx` - Transaction list
- `app/(tabs)/reports.tsx` - Reports
- `app/(tabs)/settings.tsx` - Settings
- `app/add-transaction.tsx` - Add transaction modal

**Phase 4: Migrate Components**
- `src/components/Toast.tsx`
- `src/components/LoadingOverlay.tsx`
- `src/components/TransactionDetailModal.tsx`
- `src/components/SyncStatusIndicator.tsx`

**Phase 5: Polish Dark Mode**
- Refine dark palette colors
- Adjust background orb opacity
- Consider brighter chart colors for dark mode

---

## Future Roadmap

### Visual Polish Improvements

#### Glassmorphism Cards
Add subtle blur backdrop and reduced opacity to cards for a premium feel.

#### Micro-Interactions
- Scale feedback on button presses
- Haptic feedback on key actions
- Animated number transitions for balance/amount changes

#### Enhanced Headers
Add subtle gradient mesh or animated gradient to dashboard header.

---

### Data Visualization Enhancements

#### Chart Animations
- Animated transitions when pie chart data changes
- Smooth morphing between data states

#### Timeline Chart Improvements
- Zoom and pan capability for detailed analysis
- Comparison overlays (vs. last month, vs. budget)

#### Spending Heatmap
Calendar view showing spending intensity by day.

#### Sparkline Enhancements
Show min/max reference points on sparklines.

---

### Navigation & UX Improvements

#### Quick Actions Sheet
Accessible from dashboard for common tasks:
- Add transaction
- Scan receipt
- Quick filter by category

#### Pull-to-Refresh
Custom branded animation using PrismLoader.

#### Swipe Gestures
Transaction row actions:
- Swipe left to delete
- Swipe right to quick categorize

#### Global Search
Search across transactions, categories, and notes.

---

### Complete Customization Features

#### Category Styles Screen (`app/category-styles.tsx`)
- Color picker with preset palette + custom option
- Icon grid selector (filtered Ionicons)
- Preview of category appearance
- Batch edit option for renaming

#### Dashboard Layout Screen (`app/dashboard-layout.tsx`)
- Drag-and-drop widget reordering
- Toggle visibility of widgets
- Widget size options (compact/expanded)
- Preview mode before saving

---

### Polish & Delight

#### Celebration Animations
- Confetti when savings goal is reached
- Glow effect on positive savings months

#### Progress Indicators
Visual progress bars for monthly budget remaining per category.

#### Streak Tracking
Indicators for consistent tracking habits.

#### Skeleton Loaders
Smooth skeleton animations instead of spinners during data fetch.

---

### Accessibility Improvements

#### Screen Reader Support
- `accessibilityLabel` and `accessibilityRole` on all interactive elements
- Voice-over hints for charts and complex UI

#### Color Contrast
Ensure all text meets WCAG AA contrast standards.

#### Dynamic Type
Support iOS Dynamic Type scaling for better readability.

---

### New Features

#### Budget Goals
- Set spending limits per category
- Visual progress bars showing remaining budget
- Notifications when approaching limits

#### Recurring Transactions
- Auto-detect recurring expenses
- Predict future expenses
- Show upcoming recurring payments

#### Spending Insights (AI)
Simple pattern analysis:
- "You spent 20% more on dining this month"
- "Subscriptions have increased by $15"
- "Best savings month was October"

#### iOS Widgets
Home screen widgets for:
- Quick balance view
- Monthly spending summary
- Recent transactions

#### Photo Receipt Attachment
Link photos to transactions for record keeping.

---

## Priority Matrix

### High Priority (Next Sprint)
1. Theme system implementation (enables all other visual work)
2. Complete category-styles screen
3. Complete dashboard-layout screen

### Medium Priority (Following Sprints)
4. Chart animations and interactivity
5. Swipe gestures on transactions
6. Pull-to-refresh with PrismLoader
7. Micro-interactions and haptics

### Lower Priority (Future)
8. Budget goals per category
9. Spending insights
10. iOS widgets
11. Receipt photo attachment

---

## Technical Notes

### Theme Context Pattern
```tsx
import { useTheme } from '../src/theme';

export default function Screen() {
  const { palette, isDark } = useTheme();
  // Use palette.background, palette.card, etc.
}
```

### Design Tokens
Located in `src/theme/`:
- `palette.ts` - Color palettes (light/dark)
- `typography.ts` - Font sizes, weights
- `spacing.ts` - Spacing scale, border radius
