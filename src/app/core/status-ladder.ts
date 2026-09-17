/**
 * The walk shared by both status ladders.
 *
 * Callings (core/calling-status.ts) and priesthood advancements
 * (core/advancement-status.ts) both model progress as a strictly linear
 * list of statuses with no optional steps, so "what's next" and "what's
 * one back" are the same array walk in each. The genuinely per-flow part
 * is only how the order list is DERIVED - callings pick between
 * CALLING_STATUS_ORDER and RELEASE_STATUS_ORDER and conditionally drop
 * `high_council_approved` via statusOrderFor(), while advancements always
 * use the one fixed list - so each module keeps that and hands the
 * resulting order here.
 *
 * Deliberately typed against readonly string[] rather than a union of the
 * status types: the two flows have disjoint status unions, and the walk
 * genuinely doesn't care. Each caller re-narrows on the way out.
 */

/**
 * The statuses that may follow `current`. Both ladders are linear, so this
 * is either a single-element list or empty at the terminal state (and
 * empty for a status that isn't in this order at all).
 */
export function nextInOrder(order: readonly string[], current: string): string[] {
  const idx = order.indexOf(current);
  if (idx === -1 || idx === order.length - 1) return [];
  return [order[idx + 1]];
}

/**
 * Statuses that exist in an order but are never a workflow's resting
 * `status`, and so are never a rollback target either.
 *
 * `recorded_in_lcr` is the only one today. Neither CallingsService nor
 * PriesthoodAdvancementsService ever persists it: advancing to it
 * finalizes straight to `complete` in the same write (see each service's
 * `finalizes` handling). Rolling *back* to a status no workflow can
 * actually be sitting at would be meaningless, so it's skipped over.
 *
 * This lives here rather than in either caller precisely because both
 * applied the identical filter - it's a property of how the services
 * write, not of one ladder.
 */
const NEVER_PERSISTED: readonly string[] = ['recorded_in_lcr'];

/**
 * The status one step back from `current`, or null when there isn't one -
 * already at the first status, or `current` isn't in this order.
 *
 * Named for what it is rather than as a plain array walk, because it
 * isn't one: it skips NEVER_PERSISTED statuses first. See above.
 */
export function previousRollbackTarget(
  order: readonly string[],
  current: string,
): string | null {
  const rollbackable = order.filter((s) => !NEVER_PERSISTED.includes(s));
  const idx = rollbackable.indexOf(current);
  if (idx <= 0) return null;
  return rollbackable[idx - 1];
}
