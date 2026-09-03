/**
 * Rough vertical space taken by page chrome above a list (heading, filter
 * controls, any banners) that isn't available for rows.
 */
const HEADER_RESERVE_PX = 220;

/**
 * Absolute floor, so a very short viewport never asks for a silly-small
 * page. Kept low on purpose - with the row heights and header reserve in
 * use, a typical phone viewport lands only a couple of rows above this,
 * so a higher floor would swallow the viewport estimate entirely and the
 * page size would stop varying by form factor at all (which is what
 * happened before this was tuned down).
 */
const MIN_PAGE_SIZE = 6;
const MAX_INITIAL_PAGE_SIZE = 150;

/**
 * Estimates how many rows of height `rowHeightPx` fit in the current
 * viewport, so the first Firestore query for a list asks for about one
 * screenful instead of the whole collection. Doesn't need to be exact -
 * if it undershoots, the load-more sentinel is still visible right after
 * load and immediately pulls another page.
 */
export function estimateInitialPageSize(rowHeightPx: number): number {
  if (typeof window === 'undefined') return MIN_PAGE_SIZE;
  const rows = Math.ceil((window.innerHeight - HEADER_RESERVE_PX) / rowHeightPx);
  return Math.min(MAX_INITIAL_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, rows));
}
