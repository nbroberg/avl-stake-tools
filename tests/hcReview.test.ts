import { describe, expect, it } from 'vitest';
import {
  awaitsResponseFrom,
  hasRespondedTo,
  isOpenForHighCouncilVote,
  namesFor,
  tally,
} from '../src/app/core/hc-review';
import type {
  AppUser,
  CallingStatusHistoryEntry,
  CallingWorkflow,
} from '../src/app/models/types';

function workflow(patch: Partial<CallingWorkflow> = {}): CallingWorkflow {
  return {
    id: 'wf1',
    workflowType: 'calling',
    personId: 'p1',
    personName: 'Sample Person',
    // A stake organization counselor is one of the callings that needs a
    // high council vote (see calling-authorities.ts).
    callingName: 'Stake Relief Society Second Counselor',
    status: 'presidency_approved',
    hcApprovalUids: [],
    hcConcernUids: [],
    hcRequired: 9,
    createdBy: 'u0',
    updatedBy: 'u0',
    ...patch,
  };
}

function user(patch: Partial<AppUser> = {}): AppUser {
  return {
    firebaseUid: 'hc1',
    email: 'hc1@example.com',
    displayName: 'Councilor One',
    role: 'high_council',
    active: true,
    ...patch,
  };
}

describe('isOpenForHighCouncilVote', () => {
  it('is open for a calling that needs the vote, at presidency_approved', () => {
    expect(isOpenForHighCouncilVote(workflow())).toBe(true);
  });

  it('is closed at any other status', () => {
    expect(isOpenForHighCouncilVote(workflow({ status: 'proposed' }))).toBe(false);
    expect(isOpenForHighCouncilVote(workflow({ status: 'high_council_approved' }))).toBe(false);
  });

  it('is closed for callings approved outside the stake', () => {
    // Bishop goes to the First Presidency, not the high council.
    expect(isOpenForHighCouncilVote(workflow({ callingName: 'Bishop' }))).toBe(false);
  });
});

describe('awaitsResponseFrom', () => {
  it('awaits a high councilor who has not responded', () => {
    expect(awaitsResponseFrom(workflow(), user())).toBe(true);
  });

  it('does not await someone who already approved', () => {
    const w = workflow({ hcApprovalUids: ['hc1'] });
    expect(awaitsResponseFrom(w, user())).toBe(false);
    expect(hasRespondedTo(w, user())).toBe(true);
  });

  it('does not await someone holding a concern - they have responded', () => {
    const w = workflow({ hcConcernUids: ['hc1'] });
    expect(awaitsResponseFrom(w, user())).toBe(false);
    expect(hasRespondedTo(w, user())).toBe(true);
  });

  it('never awaits the presidency', () => {
    expect(awaitsResponseFrom(workflow(), user({ role: 'stake_presidency' }))).toBe(false);
  });

  it('never awaits a signed-out or deactivated user', () => {
    expect(awaitsResponseFrom(workflow(), null)).toBe(false);
    expect(awaitsResponseFrom(workflow(), user({ active: false }))).toBe(false);
  });
});

describe('tally', () => {
  it('counts approvals against the snapshotted threshold', () => {
    const t = tally(workflow({ hcApprovalUids: ['a', 'b', 'c'], hcRequired: 3 }));
    expect(t.approved).toBe(3);
    expect(t.quorumMet).toBe(true);
    expect(t.clearToAdvance).toBe(true);
  });

  it('holds the council back while a concern is outstanding', () => {
    const t = tally(
      workflow({ hcApprovalUids: ['a', 'b', 'c'], hcConcernUids: ['d'], hcRequired: 3 }),
    );
    expect(t.quorumMet).toBe(true);
    // A concern is not a veto, but the council may not advance past it.
    expect(t.clearToAdvance).toBe(false);
    expect(t.concerns).toBe(1);
  });

  it('never reports quorum met when the threshold is missing', () => {
    const t = tally(workflow({ hcApprovalUids: ['a'], hcRequired: undefined }));
    expect(t.quorumMet).toBe(false);
  });
});

describe('namesFor', () => {
  const history: CallingStatusHistoryEntry[] = [
    { id: 'h1', status: 'proposed', changedBy: 'u0', changedByName: 'President Sample' },
    { id: 'h2', status: 'presidency_approved', changedBy: 'hc2', changedByName: 'Councilor Two' },
    { id: 'h3', status: 'presidency_approved', changedBy: 'hc1', changedByName: 'Councilor One' },
  ];

  it('resolves uids to names from the audit trail, sorted', () => {
    expect(namesFor(['hc1', 'hc2'], history)).toEqual({
      names: ['Councilor One', 'Councilor Two'],
      unnamed: 0,
    });
  });

  it('counts uids the trail cannot name rather than dropping them', () => {
    expect(namesFor(['hc1', 'ghost'], history)).toEqual({
      names: ['Councilor One'],
      unnamed: 1,
    });
  });

  it('is empty for no uids', () => {
    expect(namesFor([], history)).toEqual({ names: [], unnamed: 0 });
  });
});
