import { describe, expect, it } from 'vitest';
import { parseLcrRoster } from '../src/app/core/lcr-parser';
import { extractInScopeCallings } from '../src/app/core/callings-vocabulary';

const HEADER =
  'Full Name\tBirth Year\tUnit\tIndividual Phone\tPreferred Name\tIndividual E-mail\tCallings with Date Sustained\tPriesthood office';

function tsv(...rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

describe('parseLcrRoster', () => {
  it('parses a well-formed row and derives the id from name + birth year', () => {
    const out = parseLcrRoster(
      tsv(
        'Smith, John Andrew\t1970\tAsheville Ward\t(555) 555-0000\tSmith, John\t' +
          'sample@example.com\tStake Clerk (15 Jun 2025)\tElder',
      ),
    );
    expect(out.errors).toEqual([]);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]).toMatchObject({
      id: 'john-andrew-smith-1970',
      fullName: 'John Andrew Smith',
      displayName: 'John Smith',
      birthYear: 1970,
      unit: '139173',
      unitName: 'Asheville Ward',
      callings: ['Stake Clerk'],
      sustainedAt: { 'Stake Clerk': '2025-06-15' },
      email: 'sample@example.com',
      phone: '(555) 555-0000',
      priesthoodOffice: 'Elder',
    });
  });

  it('preserves an empty priesthoodOffice cell as "" (known no office)', () => {
    // HEADER has "Priesthood office" as its last column, so a row with an
    // empty last cell means LCR reported "no office" — that's positive
    // data (typically a woman), distinct from the column being absent.
    const out = parseLcrRoster(
      tsv(
        'Doe, Jane\t1985\tAsheville Ward\t\t\t\t' +
          'Stake Relief Society President (1 Jan 2024)\t',
      ),
    );
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].priesthoodOffice).toBe('');
  });

  it('leaves priesthoodOffice undefined when the column is absent from the paste', () => {
    // Paste without the Priesthood office column at all — we have no data.
    const header =
      'Full Name\tBirth Year\tUnit\tPreferred Name\tIndividual E-mail\tIndividual Phone\tCallings';
    const raw =
      header +
      '\n' +
      'Smith, John\t1970\tAsheville Ward\tJohn\tjohn@example.com\t555-0000\tBishop';
    const out = parseLcrRoster(raw);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].priesthoodOffice).toBeUndefined();
  });

  it('falls back to Full Name when Preferred Name is empty', () => {
    const out = parseLcrRoster(
      tsv('Smith, John\t1970\tAsheville Ward\t\t\tjohn@example.com\tBishop\t'),
    );
    expect(out.rows[0].displayName).toBe('John Smith');
  });

  it('captures sustained dates per calling and pairs them correctly', () => {
    const out = parseLcrRoster(
      tsv(
        'Doe, Jane\t1985\tAsheville Ward\t\t\t\t' +
          'Elders Quorum First Counselor (1 Jan 2024) Bishop (5 Mar 2026)\t',
      ),
    );
    expect(out.rows[0].callings).toEqual([
      'Elders Quorum First Counselor',
      'Bishop',
    ]);
    expect(out.rows[0].sustainedAt).toEqual({
      'Elders Quorum First Counselor': '2024-01-01',
      Bishop: '2026-03-05',
    });
  });

  it('imports rows with no in-scope calling too, tallied but not dropped', () => {
    // Primary Teacher is a ward-auxiliary calling; nothing stake-touchable.
    // The row is still imported (empty callings) so features keyed on
    // priesthood office alone - e.g. the Priesthood Advancement candidate
    // picker - can see everyone, not just calling holders.
    const out = parseLcrRoster(
      tsv(
        'Doe, Jane\t1985\tAsheville Ward\t\t\t\tPrimary Teacher (1 Jan 2024)\t',
        'Smith, John\t1970\tAsheville Ward\t\t\t\tBishop (5 Mar 2026)\t',
      ),
    );
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0].fullName).toBe('Jane Doe');
    expect(out.rows[0].callings).toEqual([]);
    expect(out.rows[1].fullName).toBe('John Smith');
    expect(out.rows[1].callings).toEqual(['Bishop']);
    expect(out.withoutTrackedCalling).toBe(1);
  });

  it('reports missing Birth Year', () => {
    const out = parseLcrRoster(
      tsv('Doe, Jane\t\tAsheville Ward\t\t\t\tBishop\t'),
    );
    expect(out.rows).toHaveLength(0);
    expect(out.errors[0].message).toMatch(/birth year/i);
  });

  it('rejects a row whose unit is not in the stake vocabulary', () => {
    const out = parseLcrRoster(
      tsv('Smith, John\t1970\tSome Faraway Ward\t\t\t\tBishop\t'),
    );
    expect(out.rows).toHaveLength(0);
    expect(out.errors[0].message).toMatch(/unknown unit/i);
  });

  it('rejects a paste missing required columns', () => {
    const out = parseLcrRoster(
      'Full Name\tCallings\nDoe, Jane\tBishop',
    );
    expect(out.rows).toHaveLength(0);
    expect(out.errors[0].message).toMatch(/Missing required column/);
  });

  it('detects duplicate ids within a single paste', () => {
    const out = parseLcrRoster(
      tsv(
        'Smith, John\t1970\tAsheville Ward\t\t\t\tBishop\t',
        'Smith, John\t1970\tAsheville Ward\t\t\t\tElders Quorum President\t',
      ),
    );
    expect(out.rows).toHaveLength(1);
    expect(out.errors[0].message).toMatch(/duplicate/i);
  });

  it('ignores the trailing "Count:" line', () => {
    const out = parseLcrRoster(
      tsv(
        'Smith, John\t1970\tAsheville Ward\t\t\t\tBishop\t',
        'Count: 155\t\t\t\t\t\t\t',
      ),
    );
    expect(out.rows).toHaveLength(1);
    expect(out.errors).toEqual([]);
  });

  it('drops accents in slugs so accented names still produce ASCII ids', () => {
    const out = parseLcrRoster(
      tsv('García, María\t1990\tAsheville Ward\t\t\t\tBishop\t'),
    );
    expect(out.rows[0].id).toBe('maria-garcia-1990');
  });

  it('accepts plain Callings column with no sustained dates', () => {
    // Simulate an LCR export using the plain Callings variant instead of
    // Callings with Date Sustained - no parentheses in the cell.
    const header =
      'Full Name\tBirth Year\tUnit\tPreferred Name\tIndividual E-mail\tIndividual Phone\tCallings';
    const raw =
      header +
      '\n' +
      'Smith, John\t1970\tAsheville Ward\tJohn\tjohn@example.com\t555-0000\tBishop';
    const out = parseLcrRoster(raw);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].callings).toEqual(['Bishop']);
    expect(out.rows[0].sustainedAt).toEqual({});
  });
});

describe('extractInScopeCallings', () => {
  it('extracts multiple space-joined in-scope callings', () => {
    expect(
      extractInScopeCallings('Elders Quorum First Counselor Ward Temple and Family History Consultant'),
    ).toEqual(['Elders Quorum First Counselor']);
  });

  it('distinguishes Bishop from Bishopric via word boundary', () => {
    expect(extractInScopeCallings('Bishopric Second Counselor')).toEqual([
      'Bishopric Second Counselor',
    ]);
    expect(extractInScopeCallings('Bishop Priests Quorum President')).toEqual(['Bishop']);
  });

  it('distinguishes Stake President from Stake Presidency', () => {
    expect(extractInScopeCallings('Stake President')).toEqual(['Stake President']);
    // Stake Presidency First Counselor and Audit Committee Chairman are both
    // stake callings now; the point of the test is that "Stake Presidency"
    // still doesn't collapse into the bare "Stake President" match.
    expect(
      extractInScopeCallings('Stake Presidency First Counselor Audit Committee Chairman'),
    ).toEqual(['Stake Presidency First Counselor', 'Audit Committee Chairman']);
  });

  it('prefers a longer role over a substring role', () => {
    // "Assistant Communication Director" contains "Communication Director" —
    // the longer match must win and the shorter one must not double-count.
    expect(
      extractInScopeCallings('Assistant Communication Director'),
    ).toEqual(['Assistant Communication Director']);
  });

  it('returns an empty array for out-of-scope callings', () => {
    // Primary Teacher, Ward Music Chairman, and Ward Temple and Family
    // History Consultant are all ward-only callings the stake presidency
    // never touches.
    expect(
      extractInScopeCallings('Primary Teacher Ward Music Chairman'),
    ).toEqual([]);
  });
});
