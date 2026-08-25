import { extractInScopeCallings } from './callings-vocabulary';
import { unitByName } from './units';

/**
 * A single parsed row from an LCR "Callings" custom-report export. Only
 * the fields the app actually cares about are kept - membership number
 * is retained as the stable identity key (used as the Firestore doc ID)
 * because names change on marriage and ward reorganizations, and emails
 * churn too, but the MRN doesn't.
 */
export interface ParsedPersonRow {
  mrn: string;
  name: string;
  /** Stable unit id (Church-issued unit number), not the display name. */
  unit: string;
  /** Display name from the LCR paste; kept for the review table so the user
   *  can see which unit each row belonged to before importing. */
  unitName: string;
  /** Only in-scope calling roles (stake / bishopric / EQ presidency). */
  callings: string[];
  /** Original callings cell, kept for the review table so users can see what
   *  was discarded by the in-scope filter. */
  rawCallings: string;
  email?: string;
  phone?: string;
}

export interface LcrParseError {
  line: number;
  message: string;
}

export interface LcrParseResult {
  rows: ParsedPersonRow[];
  errors: LcrParseError[];
  /** Rows that had no in-scope calling; excluded from `rows` but tallied for
   *  the import UI to show "N rows skipped (no in-scope calling)". */
  skippedOutOfScope: number;
}

const HEADER_PATTERNS = {
  mrn:      /\b(membership\s*(number|record)?|mrn|member\s*id)\b/i,
  name:     /\b(preferred\s*name|full\s*name|name|household)\b/i,
  unit:     /\bunit\b/i,
  callings: /\bcallings?\b/i,
  email:    /\b(individual\s*)?e-?mail\b/i,
  phone:    /\b(individual\s*)?phone(\s*number)?\b/i,
};

type ColumnMap = Partial<Record<keyof typeof HEADER_PATTERNS, number>>;

function identifyColumns(headerCells: string[]): ColumnMap {
  const map: ColumnMap = {};
  headerCells.forEach((cell, i) => {
    const trimmed = cell.trim();
    for (const key of Object.keys(HEADER_PATTERNS) as Array<keyof typeof HEADER_PATTERNS>) {
      if (map[key] !== undefined) continue;
      if (HEADER_PATTERNS[key].test(trimmed)) {
        map[key] = i;
      }
    }
  });
  return map;
}

function normalizeName(raw: string): string {
  const s = raw.trim();
  // "Last, First" -> "First Last". LCR's "Preferred Name" export uses
  // last-comma-first; a few rows come through as plain "First Last" so we
  // pass those through unchanged.
  const m = /^([^,]+),\s*(.+)$/.exec(s);
  if (m) return `${m[2]} ${m[1]}`.trim();
  return s;
}

function normalizeMrn(raw: string): string {
  // Keep digits only. LCR sometimes shows MRNs with hyphens (e.g.
  // 123-4567-890). The identity itself doesn't care about punctuation.
  return raw.replace(/\D+/g, '');
}

/**
 * Parses a pasted LCR callings-report TSV export. First non-blank line is
 * treated as the header and used to figure out where each column lives -
 * users are expected to include at least MRN, name, unit, and callings
 * columns, but any column order works and unrecognized columns are ignored.
 *
 * Rows without at least one in-scope calling are dropped (tallied in
 * `skippedOutOfScope`); rows missing the MRN are collected in `errors`
 * with the source line number.
 */
export function parseLcrRoster(raw: string): LcrParseResult {
  const lines = raw.split(/\r?\n/);
  const rows: ParsedPersonRow[] = [];
  const errors: LcrParseError[] = [];
  let skippedOutOfScope = 0;

  // Find the header line - first non-blank, non-"count:" line.
  let headerIdx = -1;
  let headerCells: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    if (/^count:/i.test(t)) continue;
    headerCells = lines[i].split('\t');
    headerIdx = i;
    break;
  }
  if (headerIdx === -1) {
    return { rows, errors: [{ line: 0, message: 'No content to parse.' }], skippedOutOfScope };
  }

  const cols = identifyColumns(headerCells);
  const required: Array<keyof typeof HEADER_PATTERNS> = ['mrn', 'name', 'unit', 'callings'];
  const missing = required.filter((k) => cols[k] === undefined);
  if (missing.length > 0) {
    errors.push({
      line: headerIdx + 1,
      message:
        `Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. ` +
        `Add a Membership Number column (and Name / Unit / Callings) to your LCR custom report.`,
    });
    return { rows, errors, skippedOutOfScope };
  }

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    if (/^count:/i.test(t)) continue;

    const cells = lines[i].split('\t');
    const at = (k: keyof typeof HEADER_PATTERNS): string => {
      const idx = cols[k];
      return idx !== undefined ? (cells[idx] ?? '').trim() : '';
    };

    const mrn = normalizeMrn(at('mrn'));
    const name = normalizeName(at('name'));
    const unitName = at('unit');
    const rawCallings = at('callings');
    const email = at('email') || undefined;
    const phone = at('phone') || undefined;

    if (!name) {
      errors.push({ line: i + 1, message: 'Row has no name.' });
      continue;
    }
    if (!mrn) {
      errors.push({ line: i + 1, message: `Row for ${name} has no membership number.` });
      continue;
    }

    const unitEntry = unitByName(unitName);
    if (!unitEntry) {
      errors.push({
        line: i + 1,
        message: `Row for ${name} has an unknown unit "${unitName}". Add it to core/units.ts to import.`,
      });
      continue;
    }

    const callings = extractInScopeCallings(rawCallings);
    if (callings.length === 0) {
      skippedOutOfScope += 1;
      continue;
    }

    rows.push({
      mrn,
      name,
      unit: unitEntry.number,
      unitName: unitEntry.name,
      callings,
      rawCallings,
      email,
      phone,
    });
  }

  return { rows, errors, skippedOutOfScope };
}
