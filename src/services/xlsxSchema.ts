export interface ColumnMappingLike {
  dateColumn: number | null;
  descriptionColumn: number | null;
  amountColumn: number | null;
  categoryColumn: number | null;
  headers: string[];
}

interface RowMetrics {
  nonEmpty: number;
  textCount: number;
  numericCount: number;
}

function getRowMetrics(row: string[]): RowMetrics {
  let nonEmpty = 0;
  let textCount = 0;
  let numericCount = 0;

  row.forEach(cell => {
    const value = String(cell ?? '').trim();
    if (!value) return;
    nonEmpty += 1;

    if (/[A-Za-z]/.test(value)) {
      textCount += 1;
      return;
    }

    if (looksLikeDateValue(value) || looksLikeAmount([value])) {
      numericCount += 1;
    }
  });

  return { nonEmpty, textCount, numericCount };
}

export function isLikelyHeaderRow(firstRow: string[], rows: string[][]): boolean {
  if (!firstRow || firstRow.length === 0) return false;

  const firstMetrics = getRowMetrics(firstRow);
  if (firstMetrics.nonEmpty === 0) return false;

  const nextRow = rows[0] || [];
  const nextMetrics = getRowMetrics(nextRow);

  const textDominant =
    firstMetrics.textCount >= Math.max(2, Math.ceil(firstMetrics.nonEmpty * 0.5));
  const numericLight =
    firstMetrics.numericCount <= Math.max(1, Math.floor(firstMetrics.nonEmpty * 0.2));
  const nextHasNumeric =
    nextMetrics.numericCount >= Math.max(1, Math.ceil(nextMetrics.nonEmpty * 0.3));

  if (textDominant && numericLight) {
    if (nextHasNumeric) return true;
    return true;
  }

  if (firstMetrics.numericCount >= Math.ceil(firstMetrics.nonEmpty * 0.6)) {
    return false;
  }

  if (textDominant && nextHasNumeric) return true;
  return false;
}

export function findHeaderRowIndex(rows: string[][]): number | null {
  const scanLimit = Math.min(10, rows.length);
  for (let i = 0; i < scanLimit; i += 1) {
    const row = rows[i] || [];
    if (row.length === 0) continue;
    if (isLikelyHeaderRow(row, rows.slice(i + 1, i + 6))) {
      return i;
    }
  }
  return null;
}

export function looksLikeDateValue(value: string): boolean {
  if (!value) return false;
  if (/^\d{4}[\/\-]\d{1,2}([\/\-]\d{1,2})?$/.test(value)) return true;
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(value)) return true;
  if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)$/i.test(value)) return true;

  const num = parseFloat(value);
  return !isNaN(num) && num > 30000 && num < 100000;
}

export function looksLikeDate(values: string[]): boolean {
  const datePatterns = [
    /^\d{4}-\d{2}-\d{2}/,
    /^\d{2}\/\d{2}\/\d{4}/,
    /^\d{2}-\d{2}-\d{4}/,
    /^\d{1,2}\/\d{1,2}\/\d{2,4}/,
    /^[A-Za-z]{3}\s+\d{1,2}/,
    /^\d{1,2}\s+[A-Za-z]{3}/,
  ];

  const matchCount = values.filter(v =>
    v && datePatterns.some(pattern => pattern.test(v.trim()))
  ).length;

  return matchCount >= values.length * 0.5;
}

export function looksLikeAmount(values: string[]): boolean {
  const nonEmptyValues = values.filter(v => String(v).trim().length > 0);
  if (nonEmptyValues.length === 0) return false;

  const matchCount = nonEmptyValues.filter(v => {
    const cleaned = String(v).replace(/[$,£€\s()]/g, '').trim();
    return cleaned && !isNaN(parseFloat(cleaned));
  }).length;

  return matchCount >= nonEmptyValues.length * 0.5;
}

export function looksLikeText(values: string[]): boolean {
  const textCount = values.filter(v =>
    v && v.trim().length > 2 && !/^[\d.,\-$€£%()]+$/.test(v.trim())
  ).length;

  return textCount >= values.length * 0.4;
}

export function looksLikeCategoryValues(values: string[]): boolean {
  const normalized = values
    .map(value => String(value ?? '').toLowerCase().trim())
    .filter(value => value.length > 0);
  if (normalized.length === 0) return false;

  const categoryTokens = new Set(['income', 'expense', 'expenses']);
  const matchCount = normalized.filter(value => categoryTokens.has(value)).length;
  return matchCount >= Math.max(2, Math.ceil(normalized.length * 0.5));
}

export function inferSchema(headers: string[], sampleRows: string[][]): ColumnMappingLike {
  const mapping: ColumnMappingLike = {
    dateColumn: null,
    descriptionColumn: null,
    amountColumn: null,
    categoryColumn: null,
    headers,
  };

  const datePatterns = /^(date|time|when|day|posted|transaction date|posting date|period|month|year|tanggal|fecha|datum)$/i;
  const amountPatterns = /^(amount|total|sum|price|cost|value|money|credit|debit|withdrawal|inflow|outflow|jumlah)$/i;
  const categoryPatterns = /^(category|categories|type|group|class|kind|tag|label|account|bucket|subcategory|kategori|categoria)$/i;
  const descriptionPatterns =
    /^(description|desc|name|title|memo|note|notes|detail|details|item|transaction|merchant|vendor|payee|narration|reference|ref|keterangan|remarks|particulars)$/i;

  headers.forEach((header, index) => {
    const headerLower = header.toLowerCase().trim();

    if (mapping.dateColumn === null && datePatterns.test(headerLower)) {
      mapping.dateColumn = index;
    } else if (mapping.amountColumn === null && amountPatterns.test(headerLower)) {
      mapping.amountColumn = index;
    } else if (mapping.categoryColumn === null && categoryPatterns.test(headerLower)) {
      mapping.categoryColumn = index;
    } else if (mapping.descriptionColumn === null && descriptionPatterns.test(headerLower)) {
      mapping.descriptionColumn = index;
    }
  });

  if (sampleRows.length > 0) {
    headers.forEach((_, index) => {
      const sampleValues = sampleRows.slice(0, 5).map(row => row[index] || '');

      if (mapping.dateColumn === null && looksLikeDate(sampleValues)) {
        mapping.dateColumn = index;
      }

      if (mapping.amountColumn === null && looksLikeAmount(sampleValues)) {
        mapping.amountColumn = index;
      }
    });

    if (mapping.categoryColumn === null) {
      for (let i = 0; i < headers.length; i += 1) {
        if (i === mapping.dateColumn || i === mapping.amountColumn || i === mapping.descriptionColumn) {
          continue;
        }
        const sampleValues = sampleRows.slice(0, 8).map(row => row[i] || '');
        if (looksLikeCategoryValues(sampleValues)) {
          mapping.categoryColumn = i;
          break;
        }
      }
    }

    if (mapping.descriptionColumn === null) {
      for (let i = 0; i < headers.length; i++) {
        if (i !== mapping.dateColumn && i !== mapping.amountColumn && i !== mapping.categoryColumn) {
          const sampleValues = sampleRows.slice(0, 5).map(row => row[i] || '');
          if (looksLikeText(sampleValues)) {
            mapping.descriptionColumn = i;
            break;
          }
        }
      }
    }
  }

  return mapping;
}

export function resolveTypeFromCategory(categoryValue: string): 'income' | 'expense' | null {
  const normalized = categoryValue.toLowerCase().trim();
  if (normalized === 'income') return 'income';
  if (normalized === 'expense' || normalized === 'expenses') return 'expense';
  const incomeKeywords = [
    'paycheck', 'salary', 'wage', 'wages', 'bonus', 'commission',
    'interest', 'dividend', 'dividends', 'refund', 'rebate', 'cashback',
    'side job', 'freelance', 'consulting', 'rental', 'rent income',
  ];
  if (incomeKeywords.some(keyword => normalized.includes(keyword))) return 'income';
  return null;
}

export function resolveCategoryValue(categoryValue: string, descriptionValue: string): string {
  const normalized = categoryValue.toLowerCase().trim();
  if (!normalized && descriptionValue.trim()) return descriptionValue;
  if ((normalized === 'income' || normalized === 'expense' || normalized === 'expenses') && descriptionValue.trim()) {
    return descriptionValue;
  }
  return categoryValue;
}
