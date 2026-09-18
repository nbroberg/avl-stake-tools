import { describe, expect, it } from 'vitest';
import { nextInOrder, previousRollbackTarget } from '../src/app/core/status-ladder';

/**
 * The calling and advancement ladders each have their own tests that walk
 * their real orders (callings.test.ts, advancementStatus.test.ts). These
 * pin the shared walk itself, against a deliberately synthetic order, so
 * an edge case can't quietly depend on a property that happens to hold
 * for both real ladders today.
 */
const ORDER = ['a', 'b', 'c'] as const;

describe('nextInOrder', () => {
  it('returns the single following status', () => {
    expect(nextInOrder(ORDER, 'a')).toEqual(['b']);
    expect(nextInOrder(ORDER, 'b')).toEqual(['c']);
  });

  it('returns empty at the terminal status', () => {
    expect(nextInOrder(ORDER, 'c')).toEqual([]);
  });

  it('returns empty for a status not in this order', () => {
    expect(nextInOrder(ORDER, 'bogus')).toEqual([]);
  });

  it('returns empty for an empty order', () => {
    expect(nextInOrder([], 'a')).toEqual([]);
  });
});

describe('previousRollbackTarget', () => {
  it('returns the preceding status', () => {
    expect(previousRollbackTarget(ORDER, 'c')).toBe('b');
    expect(previousRollbackTarget(ORDER, 'b')).toBe('a');
  });

  it('returns null at the first status', () => {
    expect(previousRollbackTarget(ORDER, 'a')).toBeNull();
  });

  it('returns null for a status not in this order', () => {
    expect(previousRollbackTarget(ORDER, 'bogus')).toBeNull();
  });

  it('skips over recorded_in_lcr, which no service persists', () => {
    // Both services finalize straight to `complete` when advancing to
    // recorded_in_lcr, so no workflow ever rests there and it can't be a
    // rollback target. Rolling back from `complete` must reach whatever
    // precedes it instead.
    expect(previousRollbackTarget(['a', 'recorded_in_lcr', 'complete'], 'complete')).toBe('a');
  });

  it('returns null when only a never-persisted status precedes', () => {
    expect(previousRollbackTarget(['recorded_in_lcr', 'complete'], 'complete')).toBeNull();
  });

  it('returns null when asked for the target of a never-persisted status itself', () => {
    expect(previousRollbackTarget(['a', 'recorded_in_lcr', 'complete'], 'recorded_in_lcr')).toBeNull();
  });
});
