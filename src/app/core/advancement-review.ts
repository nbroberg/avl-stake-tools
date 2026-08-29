import * as hcVote from './hc-vote';
import type {
  AdvancementHistoryEntry,
  AppUser,
  PriesthoodAdvancementWorkflow,
} from '../models/types';

/**
 * Advancement-specific wrapper over the shared high council vote mechanics
 * in core/hc-vote.ts. Unlike callings (see core/hc-review.ts), every
 * advancement goes through the same SP+HC review - there's no per-type
 * exception - so "is the vote open" here is just the status check.
 *
 * None of it is a security boundary: firestore.rules decides what an HC
 * member may actually write. These functions only decide what to show.
 */

/** The one status at which a high council vote is open. */
const VOTING_STATUS = 'presidency_approved';

/** True when this workflow is at the point of needing high council votes. */
export function isOpenForHighCouncilVote(workflow: PriesthoodAdvancementWorkflow): boolean {
  return workflow.status === VOTING_STATUS;
}

/**
 * True when this specific user still owes this workflow a response -
 * they're on the high council, the vote is open, and they have neither
 * approved nor registered a concern.
 */
export function awaitsResponseFrom(
  workflow: PriesthoodAdvancementWorkflow,
  user: AppUser | null,
): boolean {
  return hcVote.awaitsResponseFrom(isOpenForHighCouncilVote(workflow), workflow, user);
}

/** Whether the user has already approved or raised a concern. */
export function hasRespondedTo(
  workflow: PriesthoodAdvancementWorkflow,
  user: AppUser | null,
): boolean {
  return hcVote.hasRespondedTo(workflow, user);
}

export type HcTally = hcVote.HcTally;

export function tally(workflow: PriesthoodAdvancementWorkflow): HcTally {
  return hcVote.tally(workflow);
}

/**
 * Names of the members currently approving (or currently holding a
 * concern), for the presidency's view. See core/hc-vote.ts's namesFor for
 * why the audit trail, not users/{uid}, is the only readable name source.
 */
export function namesFor(
  uids: readonly string[],
  history: readonly AdvancementHistoryEntry[],
): { names: string[]; unnamed: number } {
  return hcVote.namesFor(uids, history);
}
