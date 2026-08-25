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
    });
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

  it('skips out-of-scope rows and tallies them', () => {
    const out = parseLcrRoster(
      tsv(
        'Doe, Jane\t1985\tAsheville Ward\t\t\t\tSeminary Teacher (1 Jan 2024)\t',
        'Smith, John\t1970\tAsheville Ward\t\t\t\tBishop (5 Mar 2026)\t',
      ),
    );
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].fullName).toBe('John Smith');
    expect(out.skippedOutOfScope).toBe(1);
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
    expect(extractInScopeCallings('Stake Presidency First Counselor Audit Committee Chairman')).toEqual([
      'Stake Presidency First Counselor',
    ]);
  });

  it('does not match excluded stake specialties', () => {
    expect(
      extractInScopeCallings('Stake Welfare and Self-Reliance Specialist Stake CS Missionary'),
    ).toEqual([]);
  });

  it('returns an empty array for out-of-scope callings', () => {
    expect(extractInScopeCallings('Seminary Teacher Primary Teacher')).toEqual([]);
  });
});
