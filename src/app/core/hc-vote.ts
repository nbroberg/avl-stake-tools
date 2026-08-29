import { isHighCouncil } from './roles';
import type { AppUser } from '../models/types';

/**
 * The high council vote mechanics - tally, uid->name resolution, "have you
 * responded" - are identical for every workflow kind that routes through a
 * stake-presidency-then-high-council review (callings today, priesthood
 * advancements as of this file). This module holds that shared logic once,
 * against the minimal structural shape each workflow type actually needs to
 * satisfy, rather than duplicating it per flow.
 *
 * What's deliberately NOT here: "is this workflow open for a vote right
 * now" varies per flow (a calling's vote is also gated on
 * requiresHighCouncilApproval(callingName); an advancement's isn't), so
 * that stays in core/hc-review.ts and core/advancement-review.ts, each of
 * which composes with awaitsResponseFrom() here via its own openness check.
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
