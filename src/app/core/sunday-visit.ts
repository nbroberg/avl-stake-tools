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

/**
 * Every unit number this workflow needs a sustaining vote from - its own
 * unit for a ward/branch workflow, every stake unit for a stake-wide one.
 * Shared by needsSustainingIn/completesSustaining below and by
 * CallingsService.markAllUnitsSustained.
 */
export function requiredUnitsFor(workflow: Pick<CallingWorkflow, 'unit'>): readonly string[] {
  return workflow.unit ? [workflow.unit] : stakeUnits().map((u) => u.number);
}

/**
 * True once every required unit has sustained - see requiredUnitsFor.
 *
 * A ward/branch workflow (has its own `unit`) that has already reached
 * `sustained` or a later status is treated as fully sustained even if
 * `sustainedInUnits` doesn't list its unit: `sustainedInUnits` wasn't
 * tracked for ward/branch workflows before Finalizing was added, so a
 * workflow that reached `sustained` under the old single-step model (that
 * transition WAS its one required unit's vote) has nothing to backfill.
 * New ward/branch writes populate `sustainedInUnits` too (see
 * CallingsService.advanceStatus's `sustainsOwnUnit`), so this fallback
 * only matters for that pre-existing data - it never overrides a real
 * `false` for a stake-wide workflow, which has no such status shortcut.
 */
export function isFullySustained(
  workflow: Pick<CallingWorkflow, 'unit' | 'sustainedInUnits'> & { status?: string },
): boolean {
  if (
    workflow.unit &&
    (workflow.status === 'sustained' ||
      workflow.status === 'set_apart' ||
      workflow.status === 'recorded_in_lcr' ||
      workflow.status === 'complete')
  ) {
    return true;
  }
  const done = new Set(workflow.sustainedInUnits ?? []);
  return requiredUnitsFor(workflow).every((u) => done.has(u));
}

/**
 * True while a workflow still needs at least one more unit's sustaining
 * vote - drives the Units page's "Needs sustaining" list. `status` being
 * `accepted`/`released` means no unit has sustained it yet; `sustained`
 * now covers the whole Finalizing window from the first unit's vote
 * onward (see calling-status.ts), so this also has to check
 * `isFullySustained` directly rather than relying on `status` alone -
 * a stake-wide workflow can sit at `sustained` for a long time while
 * only some units have reported.
 */
export function needsSustaining(workflow: CallingWorkflow): boolean {
  if (workflow.status === 'accepted' || workflow.status === 'released') return true;
  if (workflow.status !== 'sustained') return false;
  return !isFullySustained(workflow);
}

/**
 * True for a workflow currently in Finalizing (or, for a stake-wide one,
 * still sustaining) that hasn't been set apart yet. Deliberately not
 * gated on full sustaining or on LCR recording - either can happen in
 * either order once Finalizing has begun (`status` is `sustained` or
 * `recorded_in_lcr`; `set_apart`/`complete` already mean it happened).
 */
export function needsSetApart(workflow: CallingWorkflow): boolean {
  return (
    workflow.workflowType === 'calling' &&
    (workflow.status === 'sustained' || workflow.status === 'recorded_in_lcr') &&
    !workflow.setApartDate
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
  return isFullySustained({ ...workflow, sustainedInUnits: [...(workflow.sustainedInUnits ?? []), unitNumber] });
}

/**
 * Whether sustaining and setting apart can be folded into one action for
 * this workflow during a visit to `unitNumber` - whenever that visit
 * puts the visitor in the same room as the person being set apart.
 * Setting apart no longer has to wait for every stake unit to have
 * sustained the calling first - it can happen any time once Finalizing
 * has begun (see needsSetApart), so this doesn't require `unitNumber` to
 * be the *completing* unit anymore, just the person's own unit. Releases
 * never combine - there's no set-apart phase to fold into their
 * sustaining (their `sustained` status is a vote of thanks, not a calling
 * to finish extending), so this is false for them regardless of unit.
 */
export function canCombineSustainAndSetApart(
  workflow: Pick<CallingWorkflow, 'workflowType' | 'unit' | 'sustainedInUnits'>,
  person: Pick<Person, 'unit'> | null,
  unitNumber: string,
): boolean {
  return workflow.workflowType === 'calling' && isPersonPresentInUnit(workflow, person, unitNumber);
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
