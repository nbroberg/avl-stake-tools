import type { Timestamp } from 'firebase/firestore';
import {
  CALLING_STATUS_ORDER,
  RELEASE_STATUS_ORDER,
  type CallingStatus,
  type CallingWorkflow,
  type CallingWorkflowType,
  type ReleaseStatus,
} from '../models/types';
import { requiresHighCouncilApproval } from './calling-authorities';

/**
 * The full status list for a given workflow, with `high_council_approved`
 * dropped when the calling doesn't require SP+HC approval (ward-internal
 * callings such as EQ secretary, and callings approved externally by the
 * First Presidency, Twelve, or a GA). Releases keep their own linear
 * order regardless of calling.
 */
export function statusOrderFor(
  workflowType: CallingWorkflowType,
  callingName?: string,
): string[] {
  if (workflowType === 'release') return [...RELEASE_STATUS_ORDER];
  const base = [...CALLING_STATUS_ORDER];
  if (callingName && !requiresHighCouncilApproval(callingName)) {
    return base.filter((s) => s !== 'high_council_approved');
  }
  return base;
}

/**
 * Returns the list of statuses that are valid "next steps" from the current
 * one. Both lifecycles are strictly linear - no optional steps - so this
 * returns either the single next status or an empty array when already at
 * the terminal state. `callingName` is optional; when supplied it lets the
 * order skip the High Council step for callings that don't need it.
 */
export function getNextStatuses(
  workflowType: CallingWorkflowType,
  currentStatus: string,
  callingName?: string,
): string[] {
  const order = statusOrderFor(workflowType, callingName);
  const idx = order.indexOf(currentStatus);
  if (idx === -1 || idx === order.length - 1) return [];
  return [order[idx + 1]];
}

/**
 * The status one step before `currentStatus`, or null when there isn't one
 * (already at `proposed`, or the status isn't recognized). `recorded_in_lcr`
 * is filtered out of the order first: CallingsService.advanceStatus never
 * actually persists it as a workflow's `status` - advancing to it finalizes
 * straight to `complete` in the same write (see its `finalizes` handling) -
 * so it would never be a real rollback target either.
 */
export function getPreviousStatus(
  workflowType: CallingWorkflowType,
  currentStatus: string,
  callingName?: string,
): string | null {
  const order = statusOrderFor(workflowType, callingName).filter((s) => s !== 'recorded_in_lcr');
  const idx = order.indexOf(currentStatus);
  if (idx <= 0) return null;
  return order[idx - 1];
}

/** Maps a status to the CallingWorkflow date field it should stamp, if any. */
export const DATE_FIELD_BY_STATUS: Record<string, keyof CallingWorkflow | undefined> = {
  proposed: 'proposedDate',
  presidency_approved: 'presidencyApprovedDate',
  high_council_approved: 'highCouncilApprovedDate',
  interview_assigned: 'interviewAssignedDate',
  calling_extended: 'extendedDate',
  release_extended: 'extendedDate',
  accepted: 'acceptedDate',
  sustained: 'sustainedDate',
  set_apart: 'setApartDate',
  recorded_in_lcr: 'recordedDate',
  complete: 'completedDate',
};

/**
 * The three independent facts `nextStatus` derives `status` from once a
 * workflow has entered Finalizing (see nextStatus below) - fully
 * sustained, recorded in LCR, and (for callings) set apart.
 */
export interface FinalizingFacts {
  fullySustained: boolean;
  recorded: boolean;
  setApart: boolean;
}

/**
 * `status` beyond `sustained` is a *derivation* of three independent
 * facts (fully sustained, recorded in LCR, set apart), not something any
 * caller decides directly - see CallingsService.markUnitSustained,
 * markAllUnitsSustained, logSetApart and recordInLcr (and their
 * DemoCallingsService mirrors), all of which end by calling this.
 * `complete` requires all three (a release has no set-apart leg, so it
 * only needs the other two); short of that, `status` rests at whichever
 * of `recorded_in_lcr`/`set_apart` reflects what's true - or `sustained`
 * if nothing beyond sustaining has happened yet, or sustaining itself
 * isn't yet full. This keeps every existing status literal in the same
 * order they already have (proposed..accepted/released, sustained,
 * set_apart, recorded_in_lcr, complete) - nothing new is introduced -
 * it's just no longer *the caller's job* to decide which of the last few
 * to land on. Shared by the real and demo services so this derivation
 * can't drift between them.
 */
export function nextStatus(
  workflowType: CallingWorkflowType,
  facts: FinalizingFacts,
): CallingStatus | ReleaseStatus {
  if (!facts.fullySustained) return 'sustained';
  const closed = facts.recorded && (workflowType === 'release' || facts.setApart);
  if (closed) return 'complete';
  if (facts.recorded) return 'recorded_in_lcr';
  if (facts.setApart) return 'set_apart';
  return 'sustained';
}

/**
 * Whether Finalizing has begun - guards logSetApart/undoSetApart and
 * recordInLcr/undoRecordInLcr (real and demo), which only make sense once
 * at least one unit has sustained the workflow (spec: setting apart "can
 * be logged any time once the calling is in Finalizing"; the LCR
 * Recording page only lists callings at least one unit has sustained).
 * Calling one of those before then would otherwise compute `nextStatus`
 * against an empty sustaining checklist and wrongly land on `sustained`.
 */
export function hasEnteredFinalizing(status: string): boolean {
  return status === 'sustained' || status === 'set_apart' || status === 'recorded_in_lcr';
}

export function formatTimestamp(ts?: Timestamp): string {
  if (!ts) return '—';
  return ts.toDate().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
