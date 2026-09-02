import { describe, expect, it } from 'vitest';
import { getNextStatuses, getPreviousStatus } from '../src/app/core/calling-status';

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

describe('getPreviousStatus (calling lifecycle)', () => {
  it('returns null at the very first status', () => {
    expect(getPreviousStatus('calling', 'proposed')).toBeNull();
  });

  it('returns null for an unknown status', () => {
    expect(getPreviousStatus('calling', 'bogus')).toBeNull();
  });

  it('walks the full calling lifecycle backward', () => {
    const path: string[] = ['complete'];
    while (true) {
      const prev = getPreviousStatus('calling', path[path.length - 1]);
      if (!prev) break;
      path.push(prev);
    }
    expect(path).toEqual([
      'complete',
      'set_apart',
      'sustained',
      'accepted',
      'calling_extended',
      'interview_assigned',
      'high_council_approved',
      'presidency_approved',
      'proposed',
    ]);
  });

  it('skips the never-persisted recorded_in_lcr step when rolling back from complete', () => {
    // advanceStatus() finalizes straight to `complete`, so `recorded_in_lcr`
    // is never a workflow's actual status - rolling back must land on
    // set_apart, not on a status that was never really there.
    expect(getPreviousStatus('calling', 'complete')).toBe('set_apart');
  });

  it('skips high_council_approved for callings that do not need SP+HC approval', () => {
    expect(getPreviousStatus('calling', 'interview_assigned', 'Elders Quorum Secretary')).toBe(
      'presidency_approved',
    );
  });

  it('walks the release lifecycle backward, skipping recorded_in_lcr', () => {
    expect(getPreviousStatus('release', 'complete')).toBe('sustained');
  });
});
