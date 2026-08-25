import { describe, expect, it } from 'vitest';
import { getNextStatuses } from '../src/app/core/calling-status';

describe('getNextStatuses (calling lifecycle)', () => {
  it('walks the full calling lifecycle in order', () => {
    const path: string[] = ['proposed'];
    while (true) {
      const next = getNextStatuses('calling', path[path.length - 1]);
      if (next.length === 0) break;
      path.push(next[0]);
    }
    expect(path).toEqual([
      'proposed',
      'presidency_approved',
      'high_council_approved',
      'interview_assigned',
      'calling_extended',
      'accepted',
      'sustained',
      'set_apart',
      'recorded_in_lcr',
      'complete',
    ]);
  });

  it('returns no further statuses once complete', () => {
    expect(getNextStatuses('calling', 'complete')).toEqual([]);
  });

  it('returns empty for an unknown status', () => {
    expect(getNextStatuses('calling', 'bogus')).toEqual([]);
  });

  it('walks the release lifecycle in order', () => {
    const path: string[] = ['proposed'];
    while (true) {
      const next = getNextStatuses('release', path[path.length - 1]);
      if (next.length === 0) break;
      path.push(next[0]);
    }
    expect(path).toEqual([
      'proposed',
      'presidency_approved',
      'release_extended',
      'released',
      'sustained',
      'recorded_in_lcr',
      'complete',
    ]);
  });
});
