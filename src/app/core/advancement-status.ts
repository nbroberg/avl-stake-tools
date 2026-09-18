import { ADVANCEMENT_STATUS_ORDER, type PriesthoodAdvancementWorkflow } from '../models/types';
import { nextInOrder, previousRollbackTarget } from './status-ladder';

/**
 * The advancement ladder is strictly linear and - unlike calling-status.ts -
 * has no calling-name-dependent step to skip, since (for now) every
 * advancement goes through both the stake presidency and the high council.
 * So there's one fixed order to hand to the shared walk in
 * core/status-ladder.ts, where callings have to derive theirs first.
 */
export function getNextStatuses(currentStatus: string): string[] {
  return nextInOrder(ADVANCEMENT_STATUS_ORDER, currentStatus);
}

/**
 * See core/status-ladder.ts for the walk, including why `recorded_in_lcr`
 * is skipped - PriesthoodAdvancementsService collapses it straight into
 * `complete` and never persists it on its own, exactly as CallingsService
 * does.
 */
export function getPreviousStatus(currentStatus: string): string | null {
  return previousRollbackTarget(ADVANCEMENT_STATUS_ORDER, currentStatus);
}

/** Maps a status to the PriesthoodAdvancementWorkflow date field it should stamp. */
export const DATE_FIELD_BY_ADVANCEMENT_STATUS: Record<
  string,
  keyof PriesthoodAdvancementWorkflow | undefined
> = {
  proposed: 'proposedDate',
  presidency_approved: 'presidencyApprovedDate',
  high_council_approved: 'highCouncilApprovedDate',
  ordained: 'ordainedDate',
  recorded_in_lcr: 'recordedDate',
  complete: 'completedDate',
};
