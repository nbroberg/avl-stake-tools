import { requiresHighCouncilApproval } from './calling-authorities';
import { isHighCouncil } from './roles';
import type {
  AppUser,
  CallingWorkflow,
  PriesthoodAdvancementWorkflow,
} from '../models/types';

/**
 * The high council vote mechanics - tally, uid->name resolution, "have you
 * responded" - are identical for every workflow kind that routes through a
 * stake-presidency-then-high-council review (callings today, priesthood
 * advancements as of this file). This module holds that shared logic once,
 * against the minimal structural shape each workflow type actually needs to
 * satisfy, rather than duplicating it per flow.
 *
 * The one genuinely per-flow question is "is this workflow open for a vote
 * right now": a calling's vote is also gated on
 * requiresHighCouncilApproval(callingName), since some callings are
 * approved outside the stake (First Presidency, Twelve, a GA) and never
 * reach a high council vote at all; an advancement's isn't. Those two
 * predicates, and the per-flow awaits* helpers bound to them, live at the
 * bottom of this file. They are the only part that names a concrete
 * workflow type - everything above stays structural.
 *
 * None of this is a security boundary - firestore.rules decides what an HC
 * member may actually write. These functions only decide what to show.
 */

/** The structural shape needed for vote tallying - CallingWorkflow and
 *  PriesthoodAdvancementWorkflow both satisfy this without an explicit cast. */
export interface HcVotable {
  hcApprovalUids?: string[];
  hcConcernUids?: string[];
  hcRequired?: number;
}

/** The structural shape needed to resolve a uid to a display name from an
 *  audit trail - CallingStatusHistoryEntry and AdvancementHistoryEntry both
 *  satisfy this. */
export interface HcVoteHistoryEntry {
  changedBy: string;
  changedByName: string;
}

/** Whether the user has already approved or raised a concern. */
export function hasRespondedTo(workflow: HcVotable, user: AppUser | null): boolean {
  if (!user) return false;
  return (
    (workflow.hcApprovalUids ?? []).includes(user.firebaseUid) ||
    (workflow.hcConcernUids ?? []).includes(user.firebaseUid)
  );
}

/**
 * True when this specific user still owes a workflow a response - they're
 * on the high council, the vote is open, and they have neither approved
 * nor registered a concern. `isOpenForVote` is supplied by the caller since
 * openness is flow-specific (see module doc above).
 */
export function awaitsResponseFrom(
  isOpenForVote: boolean,
  workflow: HcVotable,
  user: AppUser | null,
): boolean {
  if (!isHighCouncil(user) || !user) return false;
  if (!isOpenForVote) return false;
  return !hasRespondedTo(workflow, user);
}

export interface HcTally {
  approved: number;
  required: number;
  concerns: number;
  quorumMet: boolean;
  /** Quorum reached AND no concern left outstanding. */
  clearToAdvance: boolean;
}

export function tally(workflow: HcVotable): HcTally {
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
  history: readonly HcVoteHistoryEntry[],
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

// ---------------------------------------------------------------------
// Per-flow openness. Everything above is structural; these name concrete
// workflow types because the difference between the flows IS the domain
// rule, and there is nothing to generalise over.
// ---------------------------------------------------------------------

/** The one status at which a high council vote is open, either flow. */
const VOTING_STATUS = 'presidency_approved';

/**
 * Whether this workflow ever passes through a high council vote at all -
 * independent of where it currently sits.
 *
 * Two separate reasons it might not:
 *
 *  1. It's a RELEASE. Releases don't go back through the high council;
 *     RELEASE_STATUS_ORDER has no `high_council_approved` rung, so a vote
 *     there could never advance anything even if it were cast.
 *  2. The calling's approving authority sits outside the stake (First
 *     Presidency, the Twelve, a GA), so no stake body votes on it.
 *
 * Clause 1 used to live only in CallingDetailComponent, which meant the
 * detail page correctly hid the approval card for a release while the
 * assignment list, callings list and dashboard all still told high
 * councilors a release was awaiting their vote. Keeping the rule in one
 * place is the point of this function.
 */
export function callingNeedsHcApproval(workflow: CallingWorkflow): boolean {
  return workflow.workflowType !== 'release' && requiresHighCouncilApproval(workflow.callingName);
}

/** True when this calling is at the point of needing high council votes. */
export function isCallingOpenForHcVote(workflow: CallingWorkflow): boolean {
  return callingNeedsHcApproval(workflow) && workflow.status === VOTING_STATUS;
}

/**
 * True when this advancement is at the point of needing high council
 * votes. Every advancement goes through the same SP+HC review, so unlike
 * a calling this is just the status check.
 */
export function isAdvancementOpenForHcVote(workflow: PriesthoodAdvancementWorkflow): boolean {
  return workflow.status === VOTING_STATUS;
}

/**
 * True when this user still owes this calling a response - on the high
 * council, vote open, and neither approved nor concerned. Drives the
 * "awaiting you" surfacing.
 */
export function callingAwaitsResponseFrom(
  workflow: CallingWorkflow,
  user: AppUser | null,
): boolean {
  return awaitsResponseFrom(isCallingOpenForHcVote(workflow), workflow, user);
}

/** The advancement counterpart of callingAwaitsResponseFrom. */
export function advancementAwaitsResponseFrom(
  workflow: PriesthoodAdvancementWorkflow,
  user: AppUser | null,
): boolean {
  return awaitsResponseFrom(isAdvancementOpenForHcVote(workflow), workflow, user);
}
