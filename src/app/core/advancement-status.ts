import { ADVANCEMENT_STATUS_ORDER, type PriesthoodAdvancementWorkflow } from '../models/types';

/**
 * The advancement ladder is strictly linear - unlike calling-status.ts,
 * there's no calling-name-dependent step to skip, since (for now) every
 * advancement goes through both the stake presidency and the high council.
 */
export function getNextStatuses(currentStatus: string): string[] {
  const idx = ADVANCEMENT_STATUS_ORDER.indexOf(currentStatus as never);
  if (idx === -1 || idx === ADVANCEMENT_STATUS_ORDER.length - 1) return [];
  return [ADVANCEMENT_STATUS_ORDER[idx + 1]];
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
