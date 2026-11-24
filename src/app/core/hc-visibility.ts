import { requiresHighCouncilApproval } from './calling-authorities';
import type { CallingWorkflow, PriesthoodAdvancementWorkflow } from '../models/types';

/**
 * When a high councilor may see a workflow at all.
 *
 * The high council has no business seeing a proposal the stake presidency
 * hasn't yet approved, so nothing is visible to them while `proposed`.
 * Beyond that it depends on whether the high council takes part in the
 * approval:
 *
 *  - A calling the high council votes on (and every priesthood
 *    advancement) becomes visible the moment the presidency approves it -
 *    that's the high council's own stage.
 *  - Anything the high council never votes on (a release, a ward calling
 *    such as EQ secretary, a calling approved outside the stake) stays
 *    hidden until it's ready to be presented in a unit (`accepted` for a
 *    sustaining vote, `released` for a vote of thanks), which is the first
 *    point a high councilor has a job to do on it (presenting it, then
 *    setting apart a calling, on a Sunday visit).
 *
 * The result is stored on each workflow as `hcVisible` and kept in step by
 * every write that changes `status` (create, advanceStatus, rollbackStatus
 * - the Finalizing helpers only move between statuses that are visible
 * for every kind of workflow, so they never change it). It's stored rather
 * than derived because Firestore rules aren't filters: a high councilor's
 * list query has to ask for `hcVisible == true` so the rules can prove it
 * only returns documents they may read. firestore.rules is the actual
 * boundary - and independently refuses `hcVisible: true` on a `proposed`
 * document - this module only decides what value to write.
 */

/** Statuses at which a workflow with no high council vote becomes visible. */
const VISIBLE_WITHOUT_HC_VOTE = new Set<string>([
  'accepted',
  'released',
  'sustained',
  'set_apart',
  'recorded_in_lcr',
  'complete',
]);

export function callingVisibleToHighCouncil(
  workflow: Pick<CallingWorkflow, 'workflowType' | 'callingName'>,
  status: string,
): boolean {
  if (status === 'proposed') return false;
  const hcVotes =
    workflow.workflowType !== 'release' && requiresHighCouncilApproval(workflow.callingName);
  return hcVotes || VISIBLE_WITHOUT_HC_VOTE.has(status);
}

/** Every advancement goes through a high council vote, so: anything past `proposed`. */
export function advancementVisibleToHighCouncil(
  status: PriesthoodAdvancementWorkflow['status'] | string,
): boolean {
  return status !== 'proposed';
}
