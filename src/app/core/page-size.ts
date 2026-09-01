/**
 * Rough vertical space taken by page chrome above a list (heading, filter
 * controls, any banners) that isn't available for rows.
 */
const HEADER_RESERVE_PX = 260;
const MIN_PAGE_SIZE = 15;
const MAX_INITIAL_PAGE_SIZE = 150;

/** Extra rows requested each time the load-more sentinel comes into view. */
export const PAGE_INCREMENT = 25;

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
