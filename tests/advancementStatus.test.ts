import { describe, expect, it } from 'vitest';
import { getPreviousStatus } from '../src/app/core/advancement-status';

describe('getPreviousStatus (advancement lifecycle)', () => {
  it('returns null at the very first status', () => {
    expect(getPreviousStatus('proposed')).toBeNull();
  });

  it('returns null for an unknown status', () => {
    expect(getPreviousStatus('bogus')).toBeNull();
  });

  it('walks the full advancement lifecycle backward', () => {
    const path: string[] = ['complete'];
    while (true) {
      const prev = getPreviousStatus(path[path.length - 1]);
      if (!prev) break;
      path.push(prev);
    }
    expect(path).toEqual([
      'complete',
      'ordained',
      'high_council_approved',
      'presidency_approved',
      'proposed',
    ]);
  });

  it('skips the never-persisted recorded_in_lcr step when rolling back from complete', () => {
    // advanceStatus() finalizes straight to `complete`, so `recorded_in_lcr`
    // is never a workflow's actual status - rolling back must land on
    // ordained, not on a status that was never really there.
    expect(getPreviousStatus('complete')).toBe('ordained');
  });
});
