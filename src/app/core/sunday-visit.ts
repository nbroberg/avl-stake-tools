import { getNextStatuses as getNextCallingStatuses } from './calling-status';
import { getNextStatuses as getNextAdvancementStatuses } from './advancement-status';
import { stakeUnits, type StakeUnit } from './units';
import type { CallingWorkflow, Person, PriesthoodAdvancementWorkflow } from '../models/types';

/**
 * Whether the person this workflow is about is physically present in
 * `unitNumber` - the only condition under which sustaining and setting
 * apart can happen in the same visit. A ward/branch-level workflow's own
 * `unit` IS where the person is; a stake-wide workflow (no unit of its
 * own, sustained ward-by-ward - see CallingWorkflow.sustainedInUnits)
 * has no such anchor, so it falls back to the person's home unit on the
 * roster.
 */
export function isPersonPresentInUnit(
  workflow: Pick<CallingWorkflow, 'unit'>,
  person: Pick<Person, 'unit'> | null,
  unitNumber: string,
): boolean {
  if (workflow.unit) return workflow.unit === unitNumber;
  return person?.unit === unitNumber;
}

/** True for a workflow currently one step away from being sustained. */
export function needsSustaining(workflow: CallingWorkflow): boolean {
  return getNextCallingStatuses(workflow.workflowType, workflow.status, workflow.callingName).includes(
    'sustained',
  );
}

/** True for a workflow currently one step away from being set apart. */
export function needsSetApart(workflow: CallingWorkflow): boolean {
  return getNextCallingStatuses(workflow.workflowType, workflow.status, workflow.callingName).includes(
    'set_apart',
  );
}

/** True for a priesthood advancement currently one step away from ordination. */
export function needsOrdination(workflow: PriesthoodAdvancementWorkflow): boolean {
  return getNextAdvancementStatuses(workflow.status).includes('ordained');
}

/**
 * Whether a workflow still needs sustaining specifically in `unitNumber` -
 * a ward/branch workflow needs it only in its own unit; a stake-wide one
 * needs it in any unit that hasn't signed off yet.
 */
export function needsSustainingIn(
  workflow: Pick<CallingWorkflow, 'unit' | 'sustainedInUnits'>,
  unitNumber: string,
): boolean {
  return workflow.unit
    ? workflow.unit === unitNumber
    : !(workflow.sustainedInUnits ?? []).includes(unitNumber);
}

/**
 * Whether marking `unitNumber` finishes the sustaining. A ward/branch
 * workflow has no checklist - its one unit always finishes it. A
 * stake-wide workflow finishes only once every unit in the stake has
 * signed off, this one included.
 */
export function completesSustaining(
  workflow: Pick<CallingWorkflow, 'unit' | 'sustainedInUnits'>,
  unitNumber: string,
): boolean {
  if (workflow.unit) return true;
  const done = new Set([...(workflow.sustainedInUnits ?? []), unitNumber]);
  return stakeUnits().every((u) => done.has(u.number));
}

/**
 * Whether sustaining and setting apart can be folded into one action for
 * this workflow during a visit to `unitNumber` - only when that visit
 * both finishes the sustaining (nothing left to wait on from another
 * unit) and puts the visitor in the same room as the person being set
 * apart. A stake-wide calling that still needs other units, or one whose
 * person lives elsewhere, still gets sustained here - just not combined.
 * Releases never combine - there's no set-apart phase to fold into their
 * sustaining (their `sustained` status is a vote of thanks, not a calling
 * to finish extending), so this is false for them regardless of unit.
 */
export function canCombineSustainAndSetApart(
  workflow: Pick<CallingWorkflow, 'workflowType' | 'unit' | 'sustainedInUnits'>,
  person: Pick<Person, 'unit'> | null,
  unitNumber: string,
): boolean {
  return (
    workflow.workflowType === 'calling' &&
    completesSustaining(workflow, unitNumber) &&
    isPersonPresentInUnit(workflow, person, unitNumber)
  );
}

export interface UnitOutstanding {
  unit: StakeUnit;
  sustainings: number;
  releases: number;
  setApart: number;
  ordinations: number;
}

/**
 * Stake-wide summary of what's outstanding per unit - the dashboard's
 * bird's-eye view of the same four buckets the Sunday page shows for one
 * unit at a time. `peopleById` is only needed to resolve a stake-wide
 * workflow's person to their home unit for the setApart/ordinations counts
 * (see isPersonPresentInUnit); ward/branch workflows never need it.
 */
export function outstandingByUnit(
  workflows: readonly CallingWorkflow[],
  advancementWorkflows: readonly PriesthoodAdvancementWorkflow[],
  peopleById: ReadonlyMap<string, Person>,
): UnitOutstanding[] {
  return stakeUnits().map((unit) => {
    let sustainings = 0;
    let releases = 0;
    let setApart = 0;
    let ordinations = 0;
    for (const w of workflows) {
      if (needsSustaining(w) && needsSustainingIn(w, unit.number)) {
        if (w.workflowType === 'release') releases++;
        else sustainings++;
      }
      if (needsSetApart(w) && isPersonPresentInUnit(w, peopleById.get(w.personId) ?? null, unit.number)) {
        setApart++;
      }
    }
    for (const w of advancementWorkflows) {
      if (needsOrdination(w) && isPersonPresentInUnit(w, peopleById.get(w.personId) ?? null, unit.number)) {
        ordinations++;
      }
    }
    return { unit, sustainings, releases, setApart, ordinations };
  });
}
