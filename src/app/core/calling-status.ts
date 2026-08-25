import type { Timestamp } from 'firebase/firestore';
import {
  CALLING_STATUS_ORDER,
  RELEASE_STATUS_ORDER,
  type CallingWorkflow,
  type CallingWorkflowType,
} from '../models/types';

function statusOrder(type: CallingWorkflowType): string[] {
  return type === 'release' ? RELEASE_STATUS_ORDER : CALLING_STATUS_ORDER;
}

/**
 * Returns the list of statuses that are valid "next steps" from the current
 * one. Both lifecycles are strictly linear in the POC - no optional steps -
 * so this returns either the single next status or an empty array when
 * already at the terminal state.
 */
export function getNextStatuses(
  workflowType: CallingWorkflowType,
  currentStatus: string,
): string[] {
  const order = statusOrder(workflowType);
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
