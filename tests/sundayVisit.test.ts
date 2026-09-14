import { beforeEach, describe, expect, it } from 'vitest';
import {
  canCombineSustainAndSetApart,
  needsSetApart,
  needsSustaining,
  requiredUnitsFor,
} from '../src/app/core/sunday-visit';
import { overrideStakeUnits } from '../src/app/core/units';
import type { CallingWorkflow, Person } from '../src/app/models/types';

const UNIT_A = { number: 'a', name: 'Unit A', kind: 'ward' } as const;
const UNIT_B = { number: 'b', name: 'Unit B', kind: 'ward' } as const;
const UNIT_C = { number: 'c', name: 'Unit C', kind: 'ward' } as const;

function workflow(patch: Partial<CallingWorkflow> = {}): CallingWorkflow {
  return {
    id: 'wf1',
    workflowType: 'calling',
    personId: 'p1',
    personName: 'Sample Person',
    callingName: 'Stake Relief Society Second Counselor',
    status: 'accepted',
    createdBy: 'u0',
    updatedBy: 'u0',
    ...patch,
  };
}

describe('sunday-visit', () => {
  beforeEach(() => {
    // A small, deterministic three-unit stake, distinct from the real
    // vocabulary - lets Finalizing's per-unit logic be tested without
    // depending on the real stake's exact unit count.
    overrideStakeUnits([UNIT_A, UNIT_B, UNIT_C]);
  });

  describe('requiredUnitsFor', () => {
    it('is just the workflow\'s own unit for a ward/branch workflow', () => {
      expect(requiredUnitsFor({ unit: 'a' })).toEqual(['a']);
    });

    it('is every stake unit for a stake-wide workflow', () => {
      expect(requiredUnitsFor({ unit: undefined })).toEqual(['a', 'b', 'c']);
    });
  });

  describe('needsSustaining', () => {
    it('is true before any unit has sustained', () => {
      expect(needsSustaining(workflow({ status: 'accepted' }))).toBe(true);
      expect(needsSustaining(workflow({ workflowType: 'release', status: 'released' }))).toBe(true);
    });

    it('stays true once Finalizing begins but not every unit is in yet', () => {
      expect(
        needsSustaining(workflow({ status: 'sustained', sustainedInUnits: ['a'] })),
      ).toBe(true);
    });

    it('is false once every required unit has sustained', () => {
      expect(
        needsSustaining(workflow({ status: 'sustained', sustainedInUnits: ['a', 'b', 'c'] })),
      ).toBe(false);
    });

    it('is false once set apart, recorded, or complete', () => {
      const statuses = ['set_apart', 'recorded_in_lcr', 'complete'] as const;
      for (const status of statuses) {
        expect(needsSustaining(workflow({ status, sustainedInUnits: ['a', 'b', 'c'] }))).toBe(false);
      }
    });
  });

  describe('needsSetApart', () => {
    it('is false for a release - no set-apart leg', () => {
      expect(
        needsSetApart(workflow({ workflowType: 'release', status: 'sustained' })),
      ).toBe(false);
    });

    it('is true once sustaining has begun, even before it is full', () => {
      expect(
        needsSetApart(workflow({ status: 'sustained', sustainedInUnits: ['a'] })),
      ).toBe(true);
    });

    it('is true once recorded in LCR but not yet set apart - the "either order" case', () => {
      expect(needsSetApart(workflow({ status: 'recorded_in_lcr' }))).toBe(true);
    });

    it('is false before any sustaining, and once already set apart or complete', () => {
      expect(needsSetApart(workflow({ status: 'accepted' }))).toBe(false);
      expect(needsSetApart(workflow({ status: 'set_apart' }))).toBe(false);
      expect(needsSetApart(workflow({ status: 'complete' }))).toBe(false);
    });
  });

  describe('canCombineSustainAndSetApart', () => {
    const person: Person = {
      id: 'p1',
      name: 'Sample Person',
      fullName: 'Sample Person',
      birthYear: 1990,
      unit: 'a',
      active: true,
    };

    it('no longer requires completing every unit - just being in the person\'s unit', () => {
      // Stake-wide, only one of three units in so far - not complete -
      // but the person lives in the unit being visited.
      expect(
        canCombineSustainAndSetApart(
          workflow({ unit: undefined, sustainedInUnits: [] }),
          person,
          'a',
        ),
      ).toBe(true);
    });

    it('is false when visiting a unit the person does not live in', () => {
      expect(
        canCombineSustainAndSetApart(workflow({ unit: undefined }), person, 'b'),
      ).toBe(false);
    });

    it('is always false for a release', () => {
      expect(
        canCombineSustainAndSetApart(workflow({ workflowType: 'release', unit: undefined }), person, 'a'),
      ).toBe(false);
    });
  });
});
