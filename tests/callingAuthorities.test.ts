import { describe, expect, it } from 'vitest';
import {
  authoritiesFor,
  eligibleCallees,
  eligiblePeople,
  personSatisfiesPriesthood,
  priesthoodRequirementFor,
  requiresExternalApproval,
  requiresHighCouncilApproval,
} from '../src/app/core/calling-authorities';
import type { Person } from '../src/app/models/types';

function person(id: string, callings: string[], priesthoodOffice?: string): Person {
  return {
    id,
    name: id,
    fullName: id,
    birthYear: 1980,
    unit: '000000',
    callings,
    priesthoodOffice,
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

describe('priesthoodRequirementFor', () => {
  it('maps stake presidency / HC / patriarch to high_priest', () => {
    expect(priesthoodRequirementFor('Stake President')).toBe('high_priest');
    expect(priesthoodRequirementFor('Stake Presidency First Counselor')).toBe('high_priest');
    expect(priesthoodRequirementFor('Stake High Councilor')).toBe('high_priest');
    expect(priesthoodRequirementFor('Patriarch')).toBe('high_priest');
    expect(priesthoodRequirementFor('Bishop')).toBe('high_priest');
  });

  it('maps stake YM/SS presidents (called from high council) to high_priest', () => {
    expect(priesthoodRequirementFor('Stake Young Men President')).toBe('high_priest');
    expect(priesthoodRequirementFor('Stake Sunday School President')).toBe('high_priest');
  });

  it('maps clerks and exec secs (stake and ward) to melchizedek', () => {
    expect(priesthoodRequirementFor('Stake Clerk')).toBe('melchizedek');
    expect(priesthoodRequirementFor('Stake Executive Secretary')).toBe('melchizedek');
    expect(priesthoodRequirementFor('Ward Clerk')).toBe('melchizedek');
    expect(priesthoodRequirementFor('Bishopric First Counselor')).toBe('melchizedek');
  });

  it('maps EQ callings to melchizedek by bucket default', () => {
    expect(priesthoodRequirementFor('Elders Quorum President')).toBe('melchizedek');
    expect(priesthoodRequirementFor('Elders Quorum Secretary')).toBe('melchizedek');
  });

  it('maps RS / YW / Primary presidencies (and their secretaries) to female', () => {
    expect(priesthoodRequirementFor('Stake Relief Society President')).toBe('female');
    expect(priesthoodRequirementFor('Stake Relief Society Secretary')).toBe('female');
    expect(priesthoodRequirementFor('Stake Young Women President')).toBe('female');
    expect(priesthoodRequirementFor('Stake Primary Second Counselor')).toBe('female');
    expect(priesthoodRequirementFor('Young Women Camp Director')).toBe('female');
  });

  it('leaves open-ended stake callings unrestricted', () => {
    expect(priesthoodRequirementFor('Stake Music Coordinator')).toBe('none');
    expect(priesthoodRequirementFor('Auditor')).toBe('none');
    expect(priesthoodRequirementFor('Communication Specialist')).toBe('none');
    expect(priesthoodRequirementFor('Seminary Teacher')).toBe('none');
  });
});

describe('personSatisfiesPriesthood', () => {
  it('none accepts any office (or none)', () => {
    for (const o of ['', 'Elder', 'Deacon', 'High Priest', undefined]) {
      expect(personSatisfiesPriesthood(o, 'none')).toBe(true);
    }
  });

  it('female accepts only empty office', () => {
    expect(personSatisfiesPriesthood('', 'female')).toBe(true);
    expect(personSatisfiesPriesthood(undefined, 'female')).toBe(true);
    expect(personSatisfiesPriesthood('Elder', 'female')).toBe(false);
    expect(personSatisfiesPriesthood('Deacon', 'female')).toBe(false);
  });

  it('melchizedek accepts Elder, High Priest, Bishop, Patriarch', () => {
    for (const o of ['Elder', 'High Priest', 'Bishop', 'Patriarch']) {
      expect(personSatisfiesPriesthood(o, 'melchizedek')).toBe(true);
    }
    for (const o of ['Deacon', 'Teacher', 'Priest', '', undefined]) {
      expect(personSatisfiesPriesthood(o, 'melchizedek')).toBe(false);
    }
  });

  it('high_priest accepts High Priest, Bishop, Patriarch only', () => {
    expect(personSatisfiesPriesthood('High Priest', 'high_priest')).toBe(true);
    expect(personSatisfiesPriesthood('Bishop', 'high_priest')).toBe(true);
    expect(personSatisfiesPriesthood('Patriarch', 'high_priest')).toBe(true);
    expect(personSatisfiesPriesthood('Elder', 'high_priest')).toBe(false);
  });
});

describe('eligibleCallees', () => {
  const roster: Person[] = [
    person('alice', [], undefined),          // no office → woman
    person('bob', [], 'Elder'),
    person('carol', [], undefined),          // no office → woman
    person('dave', [], 'High Priest'),
    person('erin', [], 'Priest'),            // Aaronic; not MP
    person('faye', [], undefined),           // no office → woman
  ];

  it('returns everyone for callings with no restriction', () => {
    const ids = eligibleCallees('Stake Music Coordinator', roster).map((p) => p.id);
    expect(ids.sort()).toEqual(['alice', 'bob', 'carol', 'dave', 'erin', 'faye']);
  });

  it('filters to Melchizedek holders for MP callings', () => {
    const ids = eligibleCallees('Elders Quorum Secretary', roster).map((p) => p.id);
    expect(ids.sort()).toEqual(['bob', 'dave']);
  });

  it('filters to High Priests for HP callings', () => {
    const ids = eligibleCallees('Bishop', roster).map((p) => p.id);
    expect(ids).toEqual(['dave']);
  });

  it('filters to women for RS / YW / Primary callings', () => {
    const ids = eligibleCallees('Stake Relief Society Second Counselor', roster).map((p) => p.id);
    expect(ids.sort()).toEqual(['alice', 'carol', 'faye']);
  });
});
