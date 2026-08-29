import { getNextStatuses } from './calling-status';
import { stakeUnits } from './units';
import type { CallingWorkflow, Person } from '../models/types';

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
  return getNextStatuses(workflow.workflowType, workflow.status, workflow.callingName).includes(
    'sustained',
  );
}

/** True for a workflow currently one step away from being set apart. */
export function needsSetApart(workflow: CallingWorkflow): boolean {
  return getNextStatuses(workflow.workflowType, workflow.status, workflow.callingName).includes(
    'set_apart',
  );
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
 */
export function canCombineSustainAndSetApart(
  workflow: Pick<CallingWorkflow, 'unit' | 'sustainedInUnits'>,
  person: Pick<Person, 'unit'> | null,
  unitNumber: string,
): boolean {
  return (
    completesSustaining(workflow, unitNumber) && isPersonPresentInUnit(workflow, person, unitNumber)
  );
}
