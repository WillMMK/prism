import { Transaction } from '../types/budget';

const toIsoDate = (monthOffset: number, day: number) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setMonth(date.getMonth() - monthOffset, day);
  return date.toISOString();
};

// Generate a pseudo-random variation based on month index (deterministic)
const getVariation = (monthOffset: number, base: number, range: number): number => {
  // Use month offset to create predictable but varied amounts
  const seed = (monthOffset * 7 + 13) % 17;
  const variation = (seed / 17 - 0.5) * range;
  return Math.round((base + variation) * 100) / 100;
};

// Get the month index (0-11) from a month offset
const getMonthIndex = (monthOffset: number): number => {
  const now = new Date();
  let m = now.getMonth() - monthOffset;
  while (m < 0) m += 12;
  return m % 12;
};

export const buildDemoTransactions = (): Transaction[] => {
  const demo: Transaction[] = [];
  const idPrefix = 'demo';
  let id = 0;
  const push = (entry: Omit<Transaction, 'id'>) => {
    id += 1;
    demo.push({ ...entry, id: `${idPrefix}-${id}` });
  };

  for (let monthOffset = 0; monthOffset < 24; monthOffset += 1) {
    const monthIndex = getMonthIndex(monthOffset);
    const payDate = toIsoDate(monthOffset, 1);

    // Income variations: occasional raises and bonuses
    let baseIncome = 4200;
    // Year 2 (older months) had lower salary
    if (monthOffset >= 12) baseIncome = 3900;
    // Recent raise (last 6 months)
    if (monthOffset < 6) baseIncome = 4500;
    // December bonus
    if (monthIndex === 11) baseIncome += 2000;
    // Occasional freelance income
    if (monthOffset % 5 === 0 && monthOffset > 0) {
      push({
        date: toIsoDate(monthOffset, 15),
        description: 'Freelance Project',
        category: 'Income',
        amount: getVariation(monthOffset, 600, 300),
        type: 'income',
      });
    }

    push({
      date: payDate,
      description: 'Paycheck',
      category: 'Income',
      amount: baseIncome,
      type: 'income',
    });

    // Rent - stable but increases once a year
    const rentAmount = monthOffset >= 12 ? 1450 : 1550;
    push({
      date: toIsoDate(monthOffset, 3),
      description: 'Rent',
      category: 'Bills & Utilities',
      amount: rentAmount,
      type: 'expense',
    });

    // Utilities - seasonal variation (higher in summer/winter)
    let utilityBase = 120;
    if (monthIndex === 0 || monthIndex === 1 || monthIndex === 11) utilityBase = 180; // Winter heating
    if (monthIndex === 6 || monthIndex === 7) utilityBase = 165; // Summer cooling
    push({
      date: toIsoDate(monthOffset, 5),
      description: 'Electric & Water',
      category: 'Bills & Utilities',
      amount: getVariation(monthOffset, utilityBase, 30),
      type: 'expense',
    });

    // Groceries - varies monthly with occasional big stock-up
    let groceryBase = 110;
    if (monthIndex === 11) groceryBase = 180; // Holiday cooking
    if (monthOffset % 3 === 0) groceryBase += 40; // Bulk shopping trip
    push({
      date: toIsoDate(monthOffset, 7),
      description: 'Grocery Market',
      category: 'Food & Dining',
      amount: getVariation(monthOffset, groceryBase, 35),
      type: 'expense',
    });

    // Second grocery trip
    push({
      date: toIsoDate(monthOffset, 20),
      description: 'Grocery Store',
      category: 'Food & Dining',
      amount: getVariation(monthOffset, 85, 25),
      type: 'expense',
    });

    // Gas - varies with season and work patterns
    let gasBase = 48;
    if (monthIndex >= 5 && monthIndex <= 8) gasBase = 65; // Summer road trips
    push({
      date: toIsoDate(monthOffset, 10),
      description: 'Gas Station',
      category: 'Transportation',
      amount: getVariation(monthOffset, gasBase, 15),
      type: 'expense',
    });

    // Streaming - stable
    push({
      date: toIsoDate(monthOffset, 12),
      description: 'Streaming Subscription',
      category: 'Entertainment',
      amount: 15.99,
      type: 'expense',
    });

    // Coffee - varies
    push({
      date: toIsoDate(monthOffset, 15),
      description: 'Coffee Shop',
      category: 'Food & Dining',
      amount: getVariation(monthOffset, 22, 12),
      type: 'expense',
    });

    // Health - pharmacy with seasonal variations
    let healthBase = 25;
    if (monthIndex === 0 || monthIndex === 1 || monthIndex === 2) healthBase = 45; // Winter cold medicines
    push({
      date: toIsoDate(monthOffset, 18),
      description: 'Pharmacy',
      category: 'Health',
      amount: getVariation(monthOffset, healthBase, 15),
      type: 'expense',
    });

    // Shopping - highly variable, more in Nov/Dec
    let shoppingBase = 60;
    if (monthIndex === 10) shoppingBase = 180; // Black Friday
    if (monthIndex === 11) shoppingBase = 250; // Holiday shopping
    push({
      date: toIsoDate(monthOffset, 21),
      description: 'Online Shopping',
      category: 'Shopping',
      amount: getVariation(monthOffset, shoppingBase, 40),
      type: 'expense',
    });

    // Dining out - varies, more in warmer months
    let diningBase = 55;
    if (monthIndex >= 4 && monthIndex <= 9) diningBase = 75; // More social in warm months
    if (monthOffset % 4 === 0) diningBase += 30; // Occasional special dinner
    push({
      date: toIsoDate(monthOffset, 24),
      description: 'Dinner Out',
      category: 'Food & Dining',
      amount: getVariation(monthOffset, diningBase, 25),
      type: 'expense',
    });

    // Gym - stable
    push({
      date: toIsoDate(monthOffset, 27),
      description: 'Gym Membership',
      category: 'Health',
      amount: 42,
      type: 'expense',
    });

    // Occasional extra expenses
    if (monthOffset % 6 === 2) {
      push({
        date: toIsoDate(monthOffset, 14),
        description: 'Car Maintenance',
        category: 'Transportation',
        amount: getVariation(monthOffset, 280, 120),
        type: 'expense',
      });
    }

    if (monthIndex === 7) { // August back-to-school / annual expenses
      push({
        date: toIsoDate(monthOffset, 8),
        description: 'Annual Insurance',
        category: 'Bills & Utilities',
        amount: 380,
        type: 'expense',
      });
    }

    // Entertainment varies
    if (monthOffset % 2 === 0) {
      push({
        date: toIsoDate(monthOffset, 22),
        description: 'Concert Tickets',
        category: 'Entertainment',
        amount: getVariation(monthOffset, 85, 45),
        type: 'expense',
      });
    }
  }

  return demo;
};

