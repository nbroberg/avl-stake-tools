import { describe, expect, it } from 'vitest';
import { parseLcrRoster } from '../src/app/core/lcr-parser';
import { extractInScopeCallings } from '../src/app/core/callings-vocabulary';

const HEADER =
  'Preferred Name\tUnit\tCallings\tPriesthood office\tMembership Number\tIndividual E-mail\tIndividual Phone';

function tsv(...rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

describe('parseLcrRoster', () => {
  it('parses a well-formed row with an in-scope calling', () => {
    const out = parseLcrRoster(
      tsv('Smith, John\tAsheville Ward\tBishop\tHigh Priest\t123456789\tjohn@example.com\t(828) 555-1212'),
    );
    expect(out.errors).toEqual([]);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]).toMatchObject({
      mrn: '123456789',
      name: 'John Smith',
      // Unit is stored as the Church-issued unit number, not the display name.
      unit: '139173',
      unitName: 'Asheville Ward',
      callings: ['Bishop'],
      email: 'john@example.com',
      phone: '(828) 555-1212',
    });
  });

  it('rejects a row whose unit is not in the stake vocabulary', () => {
    const out = parseLcrRoster(
      tsv('Smith, John\tSome Faraway Ward\tBishop\t\t123456789\t\t'),
    );
    expect(out.rows).toHaveLength(0);
    expect(out.errors[0].message).toMatch(/unknown unit/i);
  });

  it('drops rows with no in-scope calling and tallies them', () => {
    const out = parseLcrRoster(
      tsv(
        'Doe, Jane\tAsheville Ward\tSeminary Teacher Primary Teacher\t\t111111111\t\t',
        'Smith, John\tAsheville Ward\tBishop\t\t222222222\t\t',
      ),
    );
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].name).toBe('John Smith');
    expect(out.skippedOutOfScope).toBe(1);
  });

  it('reports missing MRN', () => {
    const out = parseLcrRoster(tsv('Doe, Jane\tAsheville Ward\tBishop\t\t\t\t'));
    expect(out.rows).toHaveLength(0);
    expect(out.errors[0].message).toMatch(/membership number/i);
  });

  it('rejects a paste that has no MRN column at all', () => {
    const out = parseLcrRoster(
      'Preferred Name\tUnit\tCallings\nDoe, Jane\tAsheville Ward\tBishop',
    );
    expect(out.rows).toHaveLength(0);
    expect(out.errors[0].message).toMatch(/Missing required column/);
  });

  it('ignores the trailing "Count:" line', () => {
    const out = parseLcrRoster(
      tsv('Smith, John\tAsheville Ward\tBishop\t\t123\t\t', 'Count: 155\t\t\t\t\t\t'),
    );
    expect(out.rows).toHaveLength(1);
    expect(out.errors).toEqual([]);
  });

  it('normalizes MRN by stripping non-digits', () => {
    const out = parseLcrRoster(tsv('Smith, John\tAsheville Ward\tBishop\t\t123-45-6789\t\t'));
    expect(out.rows[0].mrn).toBe('123456789');
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
