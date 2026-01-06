const XLSX = require('xlsx');

// Recreate the sheet scoring logic for testing
const SKIP_SHEET_PATTERNS = /^(instructions?|totals?|summary|category\s*names?|networth|net\s*worth|example|template|dashboard|configuration|readme|about|help)$/i;
const monthPattern = /^(Jan|Feb|Mar|Apr|May|June?|Jul|Aug|Sept?|Oct|Nov|Dec)$/i;

function scoreSheet(sheet, sheetIndex) {
    const score = {
        sheetIndex,
        sheetName: sheet.name,
        score: 0,
        headerRow: 0,
    };

    if (SKIP_SHEET_PATTERNS.test(sheet.name)) {
        score.score = -100;
        return score;
    }

    if (monthPattern.test(sheet.name)) {
        score.score += 10;
    }

    if (/^Transactions$/i.test(sheet.name)) {
        score.score += 15;
    }

    const headerScore = scoreHeaderRow(sheet.headers);
    score.score += headerScore;

    return score;
}

function scoreHeaderRow(row) {
    if (!row || row.length === 0) return 0;

    const patterns = {
        date: /^(date|time|when|day|posted)$/i,
        amount: /^(amount|total|sum|price|cost|value|credit|debit)$/i,
        description: /^(description|desc|name|title|memo|note|detail|item|payee|merchant)$/i,
        category: /^(category|type|group|class|tag|label|account|bucket)$/i,
    };

    let score = 0;
    const matched = new Set();

    for (const cell of row) {
        const value = String(cell || '').trim();
        if (!value) continue;

        if (!matched.has('date') && patterns.date.test(value)) {
            score += 25; matched.add('date');
        } else if (!matched.has('amount') && patterns.amount.test(value)) {
            score += 25; matched.add('amount');
        } else if (!matched.has('description') && patterns.description.test(value)) {
            score += 20; matched.add('description');
        } else if (!matched.has('category') && patterns.category.test(value)) {
            score += 20; matched.add('category');
        }
    }
    return score;
}

function detectDataBlock(headers, rows) {
    let endCol = headers.length - 1;

    for (let col = 1; col < headers.length; col++) {
        const headerEmpty = !headers[col]?.trim();
        const colEmpty = rows.slice(0, 10).every(r => !r?.[col]?.toString().trim());

        if (headerEmpty && colEmpty) {
            endCol = col - 1;
            break;
        }
    }

    return {
        startCol: 0,
        endCol,
        headers: headers.slice(0, endCol + 1),
    };
}

// Load the template
const workbook = XLSX.readFile('template/2026 Annual Finance Planner and Tracker.xlsx');

const sheets = workbook.SheetNames.map(name => {
    const ws = workbook.Sheets[name];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
    return {
        name,
        headers: data[0] ? data[0].map(c => String(c || '')) : [],
        rows: data.slice(1),
    };
});

console.log('=== Sheet Scores ===');
const scores = sheets.map((sheet, i) => scoreSheet(sheet, i));
scores.sort((a, b) => b.score - a.score);
for (const s of scores.slice(0, 10)) {
    console.log(`  ${s.sheetName}: score=${s.score}`);
}

const best = scores[0];
console.log();
console.log('=== BEST SHEET ===');
console.log('Name:', best.sheetName);
console.log('Score:', best.score);

const bestSheet = sheets[best.sheetIndex];
console.log('All headers:', bestSheet.headers);

const block = detectDataBlock(bestSheet.headers, bestSheet.rows);
console.log();
console.log('=== BLOCK DETECTION ===');
console.log('Block columns:', block.startCol, 'to', block.endCol);
console.log('Block headers:', block.headers);
