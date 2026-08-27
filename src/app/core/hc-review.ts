import { requiresHighCouncilApproval } from './calling-authorities';
import { isHighCouncil } from './roles';
import type {
  AppUser,
  CallingStatusHistoryEntry,
  CallingWorkflow,
} from '../models/types';

/**
 * Pure helpers for the high council's review step. Kept out of the
 * components because three screens need the same answers - the workflow
 * list, the dashboard and the detail page - and because this is the logic
 * most worth testing directly.
 *
 * None of it is a security boundary: firestore.rules decides what an HC
 * member may actually write. These functions only decide what to show.
 */

/** The one status at which a high council vote is open. */
const VOTING_STATUS = 'presidency_approved';

/** True when this workflow is at the point of needing high council votes. */
export function isOpenForHighCouncilVote(workflow: CallingWorkflow): boolean {
  return workflow.status === VOTING_STATUS && requiresHighCouncilApproval(workflow.callingName);
}

/**
 * True when this specific user still owes this workflow a response -
 * they're on the high council, the vote is open, and they have neither
 * approved nor registered a concern. Drives the "awaiting you" surfacing.
 */
export function awaitsResponseFrom(
  workflow: CallingWorkflow,
  user: AppUser | null,
): boolean {
  if (!isHighCouncil(user) || !user) return false;
  if (!isOpenForHighCouncilVote(workflow)) return false;
  return !hasRespondedTo(workflow, user);
}

/** Whether the user has already approved or raised a concern. */
export function hasRespondedTo(workflow: CallingWorkflow, user: AppUser | null): boolean {
  if (!user) return false;
  return (
    (workflow.hcApprovalUids ?? []).includes(user.firebaseUid) ||
    (workflow.hcConcernUids ?? []).includes(user.firebaseUid)
  );
}

export interface HcTally {
  approved: number;
  required: number;
  concerns: number;
  quorumMet: boolean;
  /** Quorum reached AND no concern left outstanding. */
  clearToAdvance: boolean;
}

export function tally(workflow: CallingWorkflow): HcTally {
  const approved = (workflow.hcApprovalUids ?? []).length;
  const concerns = (workflow.hcConcernUids ?? []).length;
  // A workflow with no snapshotted threshold can never be shown as met -
  // better to under-report than to imply an approval that isn't there.
  const required = workflow.hcRequired ?? Number.POSITIVE_INFINITY;
  const quorumMet = approved >= required;
  return {
    approved,
    required,
    concerns,
    quorumMet,
    clearToAdvance: quorumMet && concerns === 0,
  };
}

/**
 * Names of the members currently approving (or currently holding a
 * concern), for the presidency's view.
 *
 * The uid arrays on the workflow are the source of truth for WHO; the
 * audit history is the only readable source for their NAME, since a
 * client may read only its own users/{uid} document. So: fold the trail
 * to learn uid -> name, then filter by the authoritative array.
 *
 * A uid with no history entry (an approval recorded before this trail
 * existed) is reported as a count of unnamed members rather than being
 * silently dropped.
 */
export function namesFor(
  uids: readonly string[],
  history: readonly CallingStatusHistoryEntry[],
): { names: string[]; unnamed: number } {
  const nameByUid = new Map<string, string>();
  for (const entry of history) {
    if (entry.changedBy && entry.changedByName) {
      nameByUid.set(entry.changedBy, entry.changedByName);
    }
  }

  const names: string[] = [];
  let unnamed = 0;
  for (const uid of uids) {
    const name = nameByUid.get(uid);
    if (name) names.push(name);
    else unnamed++;
  }
  return { names: names.sort((a, b) => a.localeCompare(b)), unnamed };
}
