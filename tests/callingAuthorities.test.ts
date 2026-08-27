import { describe, expect, it } from 'vitest';
import {
  authoritiesFor,
  eligiblePeople,
  requiresExternalApproval,
  requiresHighCouncilApproval,
} from '../src/app/core/calling-authorities';
import type { Person } from '../src/app/models/types';

function person(id: string, callings: string[]): Person {
  return {
    id,
    name: id,
    fullName: id,
    birthYear: 1980,
    unit: '000000',
    callings,
    active: true,
  };
}

describe('authoritiesFor', () => {
  it('returns the stake default for uncalled-out stake roles', () => {
    // "Stake Music Coordinator" isn't in the override table and falls
    // through to the "Other stake callings" default.
    const a = authoritiesFor('Stake Music Coordinator');
    expect(a).not.toBeNull();
    expect(a!.approve).toBe('stake_presidency_and_high_council');
    expect(a!.sustain).toBe('stake_conference');
    expect(a!.callSetApart).toEqual([
      'stake_president',
      'stake_presidency_counselor',
      'high_councilor',
    ]);
  });

  it('returns SP-only set-apart for the Stake Relief Society president', () => {
    const a = authoritiesFor('Stake Relief Society President');
    expect(a!.callSetApart).toEqual(['stake_president']);
  });

  it('captures the Bishop external-approval path', () => {
    const a = authoritiesFor('Bishop');
    expect(a!.approve).toBe('first_presidency_and_twelve');
    expect(a!.sustain).toBe('ward');
    expect(a!.callSetApart).toEqual(['stake_president']);
  });

  it('captures the Patriarch Q12 approval path with alternate setter-apart', () => {
    const a = authoritiesFor('Patriarch');
    expect(a!.approve).toBe('quorum_of_twelve');
    expect(a!.callSetApart).toEqual([
      'stake_president',
      'first_presidency_member_or_twelve',
    ]);
  });

  it('captures the Elders Quorum secretary bishopric-approves branch', () => {
    const a = authoritiesFor('Elders Quorum Secretary');
    expect(a!.approve).toBe('bishopric');
    expect(a!.sustain).toBe('quorum');
  });

  it('returns null for a role outside every vocabulary bucket', () => {
    expect(authoritiesFor('Not A Real Calling')).toBeNull();
  });
});

describe('requiresHighCouncilApproval', () => {
  it('true for most stake callings', () => {
    expect(requiresHighCouncilApproval('Stake Clerk')).toBe(true);
    expect(requiresHighCouncilApproval('Stake Music Coordinator')).toBe(true);
    expect(requiresHighCouncilApproval('Bishopric First Counselor')).toBe(true);
  });

  it('false for callings approved outside the stake', () => {
    expect(requiresHighCouncilApproval('Stake President')).toBe(false);
    expect(requiresHighCouncilApproval('Bishop')).toBe(false);
    expect(requiresHighCouncilApproval('Patriarch')).toBe(false);
    expect(requiresHighCouncilApproval('Stake Presidency First Counselor')).toBe(false);
  });

  it('false for ward-internal callings approved by the bishopric', () => {
    expect(requiresHighCouncilApproval('Elders Quorum Secretary')).toBe(false);
  });
});

describe('requiresExternalApproval', () => {
  it('true only for callings approved above the stake', () => {
    expect(requiresExternalApproval('Bishop')).toBe(true);
    expect(requiresExternalApproval('Patriarch')).toBe(true);
    expect(requiresExternalApproval('Stake President')).toBe(true);
    expect(requiresExternalApproval('Stake Presidency First Counselor')).toBe(true);
    expect(requiresExternalApproval('Stake Clerk')).toBe(false);
    expect(requiresExternalApproval('Elders Quorum Secretary')).toBe(false);
  });
});

describe('eligiblePeople', () => {
  const roster = [
    person('kyle', ['Stake President']),
    person('craig', ['Stake Presidency First Counselor']),
    person('paul', ['Stake Presidency Second Counselor']),
    person('russ', ['Stake High Councilor']),
    person('brian', ['Stake High Councilor', 'Stake Sunday School President']),
    person('someone', ['Bishop']),
    person('random', ['Elders Quorum Secretary']),
  ];

  it('lists just the stake president when that is the only eligible actor', () => {
    const authorities = authoritiesFor('Stake Relief Society President')!;
    const names = eligiblePeople(authorities.callSetApart, roster).map((p) => p.name);
    expect(names).toEqual(['kyle']);
  });

  it('lists the SP + counselors for clerk-style callings', () => {
    const authorities = authoritiesFor('Stake Clerk')!;
    const names = eligiblePeople(authorities.callSetApart, roster).map((p) => p.name);
    expect(names.sort()).toEqual(['craig', 'kyle', 'paul']);
  });

  it('lists the SP, counselors, and high councilors for "other stake" callings', () => {
    const authorities = authoritiesFor('Stake Music Coordinator')!;
    const names = eligiblePeople(authorities.callSetApart, roster).map((p) => p.name);
    expect(names.sort()).toEqual(['brian', 'craig', 'kyle', 'paul', 'russ']);
  });

  it('returns [] when the only eligible actors are off-stake (Bishop calling)', () => {
    const authorities = authoritiesFor('Bishop')!;
    // callSetApart is ['stake_president'] which IS on-stake — so this
    // yields the stake president. Verify.
    const names = eligiblePeople(authorities.callSetApart, roster).map((p) => p.name);
    expect(names).toEqual(['kyle']);
  });

  it('returns [] when the callSetApart is General Authority only', () => {
    const authorities = authoritiesFor('Stake President')!;
    expect(eligiblePeople(authorities.callSetApart, roster)).toEqual([]);
  });
});
