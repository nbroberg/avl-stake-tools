import { describe, expect, it } from 'vitest';
import { requiresHighCouncilApproval } from '../src/app/core/calling-authorities';
import { statusOrderFor } from '../src/app/core/calling-status';
import {
  advancementVisibleToHighCouncil,
  callingVisibleToHighCouncil,
} from '../src/app/core/hc-visibility';
import { ADVANCEMENT_STATUS_ORDER } from '../src/app/models/types';

const HC_VOTED = 'Elders Quorum President';
const NO_HC_VOTE = 'Elders Quorum Secretary';

/** Which statuses along a workflow's own ladder the high council can see. */
function visibleSteps(workflowType: 'calling' | 'release', callingName: string): string[] {
  return statusOrderFor(workflowType, callingName).filter((s) =>
    callingVisibleToHighCouncil({ workflowType, callingName }, s),
  );
}

describe('callingVisibleToHighCouncil', () => {
  it('uses callings that do and do not go to a high council vote', () => {
    expect(requiresHighCouncilApproval(HC_VOTED)).toBe(true);
    expect(requiresHighCouncilApproval(NO_HC_VOTE)).toBe(false);
  });

  it('shows a high-council-voted calling from presidency approval on', () => {
    expect(visibleSteps('calling', HC_VOTED)).toEqual([
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

  it('shows a calling with no high council vote only once it is ready to sustain', () => {
    expect(visibleSteps('calling', NO_HC_VOTE)).toEqual([
      'accepted',
      'sustained',
      'set_apart',
      'recorded_in_lcr',
      'complete',
    ]);
  });

  it('shows a release only once it is released, even for a high-council-voted calling', () => {
    for (const name of [HC_VOTED, NO_HC_VOTE]) {
      expect(visibleSteps('release', name)).toEqual([
        'released',
        'sustained',
        'recorded_in_lcr',
        'complete',
      ]);
    }
  });

  it('never shows anything while proposed', () => {
    expect(callingVisibleToHighCouncil({ workflowType: 'calling', callingName: HC_VOTED }, 'proposed')).toBe(false);
    expect(callingVisibleToHighCouncil({ workflowType: 'release', callingName: HC_VOTED }, 'proposed')).toBe(false);
  });
});

describe('advancementVisibleToHighCouncil', () => {
  it('shows an advancement at every step after proposed', () => {
    expect(ADVANCEMENT_STATUS_ORDER.filter((s) => advancementVisibleToHighCouncil(s))).toEqual(
      ADVANCEMENT_STATUS_ORDER.filter((s) => s !== 'proposed'),
    );
  });
});
