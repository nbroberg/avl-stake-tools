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

  it('skips high_council_approved for callings that do not need SP+HC approval', () => {
    // Elders Quorum Secretary is approved by the bishopric, not the SP+HC,
    // so the workflow should walk from presidency_approved straight to
    // interview_assigned.
    const path: string[] = ['proposed'];
    while (true) {
      const next = getNextStatuses('calling', path[path.length - 1], 'Elders Quorum Secretary');
      if (next.length === 0) break;
      path.push(next[0]);
    }
    expect(path).toEqual([
      'proposed',
      'presidency_approved',
      'interview_assigned',
      'calling_extended',
      'accepted',
      'sustained',
      'set_apart',
      'recorded_in_lcr',
      'complete',
    ]);
  });

  it('skips high_council_approved for externally-approved callings (Bishop)', () => {
    const next = getNextStatuses('calling', 'presidency_approved', 'Bishop');
    expect(next).toEqual(['interview_assigned']);
  });

  it('keeps high_council_approved for SP+HC-approved callings', () => {
    const next = getNextStatuses('calling', 'presidency_approved', 'Stake Clerk');
    expect(next).toEqual(['high_council_approved']);
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
