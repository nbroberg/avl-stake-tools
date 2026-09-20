import { extractInScopeCallings } from './callings-vocabulary';
import { unitByName } from './units';

/**
 * A single parsed row from an LCR "Callings" custom-report export.
 *
 * Identity is a slug derived from Full Name + Birth Year (see
 * Person.id in models/types.ts for the rationale). Full Name is the
 * source of the slug because it changes less often than Preferred
 * Name; Preferred Name flows into `displayName` for the UI. Birth
 * Year (year only, no day/month) is captured because it's the
 * tiebreaker for same-name people at stake scale.
 *
 * Sustained dates carried in LCR's "Callings with Date Sustained"
 * variant are stripped before the vocabulary matcher runs - the
 * calling name is what the app cares about; adding per-calling
 * timestamps to Person is a future extension.
 */
export interface ParsedPersonRow {
  /** Firestore doc id: slug(fullName) + '-' + birthYear. */
  id: string;
  fullName: string;
  displayName: string;
  birthYear: number;
  /** Stable unit id (Church-issued unit number), not the display name. */
  unit: string;
  /** Display name for the unit; kept for the review table. */
  unitName: string;
  /**
   * In-scope calling roles only (stake / bishopric / EQ presidency),
   * as canonical vocabulary names - this is what workflow logic
   * (eligibility, holder lookups, singleton checks) matches against,
   * so it stays a filtered, canonicalized subset even though
   * `allCallings` now carries everything.
   */
  callings: string[];
  /**
   * Every calling in the pasted cell, in-scope or not, as LCR's own
   * text (not canonicalized) - Primary Teacher, Ward Missionary,
   * Relief Society President, whatever's actually there. This is what
   * "does this person currently serve in anything" checks against;
   * `callings` alone can't answer that, since it only ever sees the
   * narrow tracked vocabulary.
   */
  allCallings: string[];
  /**
   * Per-calling sustained dates, if the LCR export included them
   * (from "Callings with Date Sustained"). Keyed by canonical role
   * name, ISO date string YYYY-MM-DD. Only in-scope callings appear.
   */
  sustainedAt: Record<string, string>;
  /** Original callings cell (dates preserved) for the review table. */
  rawCallings: string;
  email?: string;
  phone?: string;
  /** LCR "Priesthood office" cell if the export included that column.
   *  Passed through unchanged; empty for women and unordained males. */
  priesthoodOffice?: string;
}

export interface LcrParseError {
  line: number;
  message: string;
}

export interface LcrParseResult {
  rows: ParsedPersonRow[];
  errors: LcrParseError[];
  /**
   * Count of rows in `rows` whose Callings cell matched none of the
   * stake/bishopric/EQ vocabulary (core/callings-vocabulary.ts) - a
   * Priest with no calling, a Sunday School teacher, etc. These people
   * are still imported (with an empty `callings` array) so features that
   * need the full roster by priesthood office - the Priesthood
   * Advancement candidate picker, for one - can see them; this count is
   * purely informational for the import review screen.
   */
  withoutTrackedCalling: number;
}

const HEADER_PATTERNS = {
  fullName:         /\bfull\s*name\b/i,
  preferredName:    /\bpreferred\s*name\b/i,
  birthYear:        /\bbirth\s*year\b/i,
  unit:             /^unit$/i, // exact "Unit" - not Unit Abbreviation
  callings:         /\bcallings?\b/i,
  email:            /\b(individual\s*)?e-?mail\b/i,
  phone:            /\b(individual\s*)?phone(\s*number)?\b/i,
  priesthoodOffice: /\bpriesthood\s*office\b/i,
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
  // "Last, First" -> "First Last". LCR's Full Name and Preferred Name
  // export uses last-comma-first; plain "First Last" passes through.
  const m = /^([^,]+),\s*(.+)$/.exec(s);
  if (m) return `${m[2]} ${m[1]}`.trim();
  return s;
}

/**
 * Turn a normalized name into a URL/doc-id-safe slug. Strips accents
 * (María -> maria), lowercases, hyphenates, and drops any character
 * that isn't a letter, digit, or hyphen. Firestore doc ids allow more
 * than this, but keeping ids ASCII+hyphen makes them safe to bookmark,
 * grep, and paste anywhere.
 */
function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

const MONTHS: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

/**
 * Parse an LCR sustained-date string ("15 Jun 2025") into ISO
 * YYYY-MM-DD. Returns null on anything unparseable so callers can
 * fall back cleanly.
 */
function parseLcrDate(s: string): string | null {
  const m = /^\s*(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s*$/.exec(s);
  if (!m) return null;
  const day = Number(m[1]);
  const monthKey = m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase();
  const month = MONTHS[monthKey];
  const year = Number(m[3]);
  if (!month || day < 1 || day > 31 || year < 1900 || year > 2100) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Split a Callings-with-Date-Sustained cell into (callingText, date)
 * pairs. LCR emits e.g. `Stake Clerk (15 Jun 2025) Sunday School
 * Teacher (1 Jan 2026)` where each parenthetical is the sustained
 * date for the calling immediately before it. Callings whose date
 * LCR omitted (plain Callings variant, or trailing calling with no
 * paren) still come through - their sustainedAt is null.
 */
function splitCallingsWithDates(
  raw: string,
): Array<{ text: string; sustainedAt: string | null }> {
  const parts = raw.split(/\s*(\([^)]*\))\s*/);
  const out: Array<{ text: string; sustainedAt: string | null }> = [];
  for (let i = 0; i < parts.length; i += 2) {
    const text = (parts[i] ?? '').trim();
    if (!text) continue;
    const paren = parts[i + 1];
    const inner = paren ? paren.slice(1, -1) : null;
    const iso = inner ? parseLcrDate(inner) : null;
    out.push({ text, sustainedAt: iso });
  }
  return out;
}

/**
 * Parses a pasted LCR callings-report TSV export. First non-blank line
 * is the header and drives column mapping - column order and
 * unrecognized columns are both handled. Every person is imported
 * regardless of calling - every calling in their cell lands in
 * `allCallings` as LCR wrote it, while only the in-scope subset
 * (stake / bishopric / EQ presidency) is also canonicalized into
 * `callings`, which is what eligibility and holder-lookup logic
 * matches against. `withoutTrackedCalling` tallies rows with no
 * in-scope calling - not the same as having no calling at all. Rows
 * missing Full Name, Birth Year, or a recognized Unit are collected in
 * `errors` with the source line number instead.
 */
export function parseLcrRoster(raw: string): LcrParseResult {
  const lines = raw.split(/\r?\n/);
  const rows: ParsedPersonRow[] = [];
  const errors: LcrParseError[] = [];
  let withoutTrackedCalling = 0;

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
    return {
      rows,
      errors: [{ line: 0, message: 'No content to parse.' }],
      withoutTrackedCalling,
    };
  }

  const cols = identifyColumns(headerCells);
  const required: Array<keyof typeof HEADER_PATTERNS> = [
    'fullName',
    'birthYear',
    'unit',
    'callings',
  ];
  const missing = required.filter((k) => cols[k] === undefined);
  if (missing.length > 0) {
    const labels: Record<string, string> = {
      fullName: 'Full Name',
      birthYear: 'Birth Year',
      unit: 'Unit',
      callings: 'Callings',
    };
    errors.push({
      line: headerIdx + 1,
      message:
        `Missing required column${missing.length > 1 ? 's' : ''}: ${missing.map((k) => labels[k] ?? k).join(', ')}. ` +
        `Add these to your LCR custom report (Preferred Name and contact fields are optional).`,
    });
    return { rows, errors, withoutTrackedCalling };
  }

  const seenIds = new Set<string>();

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    if (/^count:/i.test(t)) continue;

    const cells = lines[i].split('\t');
    const at = (k: keyof typeof HEADER_PATTERNS): string => {
      const idx = cols[k];
      return idx !== undefined ? (cells[idx] ?? '').trim() : '';
    };

    const fullName = normalizeName(at('fullName'));
    const preferredRaw = at('preferredName');
    const displayName = preferredRaw ? normalizeName(preferredRaw) : fullName;
    const birthYearRaw = at('birthYear');
    const unitName = at('unit');
    const rawCallings = at('callings');
    const email = at('email') || undefined;
    const phone = at('phone') || undefined;
    // Distinct semantics matter here: an empty cell in a paste that DOES
    // include the Priesthood office column is a real fact ("no office" —
    // typically a woman), whereas the column being absent means we simply
    // don't know. Preserve the difference: '' when the column is present,
    // undefined when it isn't. Downstream (personSatisfiesPriesthood,
    // priesthoodGap) treats '' as female-eligible and undefined as unknown.
    const priesthoodOffice =
      cols.priesthoodOffice !== undefined ? at('priesthoodOffice') : undefined;

    if (!fullName) {
      errors.push({ line: i + 1, message: 'Row has no Full Name.' });
      continue;
    }
    const birthYear = Number.parseInt(birthYearRaw, 10);
    if (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > 2100) {
      errors.push({
        line: i + 1,
        message: `Row for ${fullName} has invalid Birth Year "${birthYearRaw}".`,
      });
      continue;
    }
    const unitEntry = unitByName(unitName);
    if (!unitEntry) {
      errors.push({
        line: i + 1,
        message: `Row for ${fullName} has an unknown unit "${unitName}". Add it to core/units.ts to import.`,
      });
      continue;
    }

    // Split each "text (date)" chunk from LCR, run each text through
    // the vocabulary matcher, and pair every in-scope hit with its
    // chunk's sustained date. A chunk may hit multiple vocabulary
    // roles (rare) - all of them get the same sustainedAt. Every
    // chunk's own text, matched or not, also lands in allCallings.
    const chunks = splitCallingsWithDates(rawCallings);
    const callings: string[] = [];
    const allCallings: string[] = [];
    const sustainedAt: Record<string, string> = {};
    for (const c of chunks) {
      if (!allCallings.includes(c.text)) allCallings.push(c.text);
      const hits = extractInScopeCallings(c.text);
      for (const role of hits) {
        if (callings.includes(role)) continue;
        callings.push(role);
        if (c.sustainedAt) sustainedAt[role] = c.sustainedAt;
      }
    }
    if (callings.length === 0) {
      withoutTrackedCalling += 1;
    }

    const id = `${slugify(fullName)}-${birthYear}`;
    if (seenIds.has(id)) {
      errors.push({
        line: i + 1,
        message: `Duplicate id "${id}" for ${fullName} (same normalized name + birth year already in this paste).`,
      });
      continue;
    }
    seenIds.add(id);

    rows.push({
      id,
      fullName,
      displayName,
      birthYear,
      unit: unitEntry.number,
      unitName: unitEntry.name,
      callings,
      allCallings,
      sustainedAt,
      rawCallings,
      email,
      phone,
      priesthoodOffice,
    });
  }

  return { rows, errors, withoutTrackedCalling };
}
