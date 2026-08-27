import type { Timestamp } from 'firebase/firestore';
import {
  CALLING_STATUS_ORDER,
  RELEASE_STATUS_ORDER,
  type CallingWorkflow,
  type CallingWorkflowType,
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

export function formatTimestamp(ts?: Timestamp): string {
  if (!ts) return '—';
  return ts.toDate().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
