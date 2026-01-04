/**
 * Test Data for Transaction Log Format Tests
 * Dummy data simulating various transaction log formats in Google Sheets
 */

// Standard transaction log format (Date, Description, Amount, Category)
export const STANDARD_TRANSACTION_LOG = {
    headers: ['Date', 'Description', 'Amount', 'Category'],
    rows: [
        ['2026-01-01', 'Grocery shopping at Woolworths', '-85.50', 'Groceries'],
        ['2026-01-02', 'Salary deposit', '5500.00', 'Salary'],
        ['2026-01-03', 'Netflix subscription', '-15.99', 'Entertainment'],
        ['2026-01-04', 'Electric bill', '-120.00', 'Utilities'],
        ['2026-01-05', 'Coffee with client', '-12.50', 'Business'],
        ['2026-01-06', 'Freelance payment', '800.00', 'Income'],
        ['2026-01-07', 'Fuel for car', '-65.00', 'Transport'],
        ['2026-01-08', 'Rent payment', '-1800.00', 'Housing'],
    ],
};

// Bank statement format (common export format)
export const BANK_STATEMENT_FORMAT = {
    headers: ['Transaction Date', 'Posting Date', 'Description', 'Debit', 'Credit', 'Balance'],
    rows: [
        ['01/01/2026', '01/01/2026', 'WOOLWORTHS GROUP', '85.50', '', '4914.50'],
        ['02/01/2026', '02/01/2026', 'SALARY CREDIT', '', '5500.00', '10414.50'],
        ['03/01/2026', '03/01/2026', 'NETFLIX.COM', '15.99', '', '10398.51'],
        ['04/01/2026', '04/01/2026', 'AGL ENERGY', '120.00', '', '10278.51'],
    ],
};

// Minimal format (only essential columns)
export const MINIMAL_FORMAT = {
    headers: ['Date', 'Amount'],
    rows: [
        ['2026-01-01', '-85.50'],
        ['2026-01-02', '5500.00'],
        ['2026-01-03', '-15.99'],
        ['2026-01-04', '-120.00'],
    ],
};

// Indonesian format (localized headers)
export const INDONESIAN_FORMAT = {
    headers: ['Tanggal', 'Keterangan', 'Jumlah', 'Kategori'],
    rows: [
        ['01/01/2026', 'Belanja bulanan', '-500000', 'Kebutuhan'],
        ['02/01/2026', 'Gaji bulan Januari', '15000000', 'Gaji'],
        ['03/01/2026', 'Bayar listrik', '-350000', 'Utilitas'],
        ['05/01/2026', 'Makan siang', '-75000', 'Makanan'],
    ],
};

// Day-first date format (Australian/European)
export const DAY_FIRST_DATE_FORMAT = {
    headers: ['Date', 'Description', 'Amount', 'Category'],
    rows: [
        ['01/01/2026', 'Grocery shopping', '-85.50', 'Groceries'],
        ['15/01/2026', 'Salary', '5500.00', 'Income'],
        ['28/02/2026', 'Rent', '-1800.00', 'Housing'],
        ['31/12/2025', 'New Year supplies', '-250.00', 'Shopping'],
    ],
};

// Accounting format (negative in parentheses)
export const ACCOUNTING_FORMAT = {
    headers: ['Date', 'Memo', 'Amount', 'Account'],
    rows: [
        ['2026-01-01', 'Office supplies', '(85.50)', 'Expenses'],
        ['2026-01-02', 'Client payment', '5500.00', 'Revenue'],
        ['2026-01-03', 'Software subscription', '(15.99)', 'Expenses'],
        ['2026-01-04', 'Utility payment', '(120.00)', 'Expenses'],
    ],
};

// No header format (data-only, headers inferred from patterns)
export const NO_HEADER_FORMAT = {
    headers: ['', '', '', ''],
    rows: [
        ['2026-01-01', 'Grocery shopping', '-85.50', 'Food'],
        ['2026-01-02', 'Salary deposit', '5500.00', 'Income'],
        ['2026-01-03', 'Netflix', '-15.99', 'Entertainment'],
        ['2026-01-04', 'Electric bill', '-120.00', 'Utilities'],
    ],
};

// Currency symbol format
export const CURRENCY_FORMAT = {
    headers: ['Date', 'Description', 'Amount', 'Category'],
    rows: [
        ['2026-01-01', 'Grocery shopping', '-$85.50', 'Groceries'],
        ['2026-01-02', 'Salary deposit', '$5,500.00', 'Salary'],
        ['2026-01-03', 'Netflix subscription', '-$15.99', 'Entertainment'],
        ['2026-01-04', 'Electric bill', '-$120.00', 'Utilities'],
    ],
};

// Excel serial date format
export const EXCEL_SERIAL_DATES = {
    headers: ['Date', 'Description', 'Amount', 'Category'],
    rows: [
        ['46023', 'Grocery shopping', '-85.50', 'Groceries'], // ~2026-01-01
        ['46024', 'Salary deposit', '5500.00', 'Salary'],
        ['46025', 'Netflix subscription', '-15.99', 'Entertainment'],
        ['46026', 'Electric bill', '-120.00', 'Utilities'],
    ],
};

// Expected column mappings for testing schema detection
export const EXPECTED_MAPPINGS = {
    STANDARD: {
        dateColumn: 0,
        descriptionColumn: 1,
        amountColumn: 2,
        categoryColumn: 3,
    },
    BANK_STATEMENT: {
        dateColumn: 0, // Transaction Date
        descriptionColumn: 2, // Description
        amountColumn: null, // Split into Debit/Credit - needs special handling
        categoryColumn: null,
    },
    MINIMAL: {
        dateColumn: 0,
        descriptionColumn: null,
        amountColumn: 1,
        categoryColumn: null,
    },
    INDONESIAN: {
        dateColumn: 0, // Tanggal
        descriptionColumn: 1, // Keterangan
        amountColumn: 2, // Jumlah
        categoryColumn: 3, // Kategori
    },
};
