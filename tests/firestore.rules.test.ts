import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, deleteField, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/**
 * Guards the app's actual security boundary. Firebase Auth only proves
 * identity (see auth.service.ts) - whether an identity may read member PII
 * (name, unit, email, phone, priesthood/calling status) is decided
 * entirely by firestore.rules. A future edit that widens a `read` clause
 * (e.g. isAnyApprovedUser() loosened to isSignedIn(), or a stray `if true`)
 * would otherwise ship to the public repo/live project silently. This
 * suite fails the build if any of those boundaries move.
 *
 * Runs against the Firestore emulator: `npm run test:rules` (wraps this
 * file in `firebase emulators:exec`). Not part of the default `npm test`
 * run, since that has no emulator available.
 */

let testEnv: RulesTestEnvironment;

const PRESIDENT_UID = 'presidency-uid';
const COUNCILOR_UID = 'hc-uid';
const INACTIVE_UID = 'inactive-uid';
const UNAPPROVED_UID = 'unapproved-uid';

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-avlstake-rules-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Seed the authorization table and some sample PII with the admin SDK,
  // bypassing rules - mirrors how the app is actually provisioned (the
  // `users` collection is never writable from the client; see
  // firestore.rules).
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', PRESIDENT_UID), {
      role: 'stake_presidency',
      active: true,
      displayName: 'President',
    });
    await setDoc(doc(db, 'users', COUNCILOR_UID), {
      role: 'high_council',
      active: true,
      displayName: 'Councilor',
    });
    await setDoc(doc(db, 'users', INACTIVE_UID), {
      role: 'high_council',
      active: false,
      displayName: 'Former Councilor',
    });
    await setDoc(doc(db, 'people', 'person-1'), {
      name: 'Real Member',
      unit: '900101',
      active: true,
    });
    await setDoc(doc(db, 'callingWorkflows', 'wf-1'), { status: 'proposed' });
    await setDoc(doc(db, 'priesthoodAdvancements', 'wf-1'), { status: 'proposed' });
    await setDoc(doc(db, 'rosterSync', 'status'), { behind: false });
  });
});

describe('people (name, unit, email, phone)', () => {
  it('denies unauthenticated reads', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'people', 'person-1')));
  });

  it('denies reads from a signed-in account with no users/{uid} doc', async () => {
    const db = testEnv.authenticatedContext(UNAPPROVED_UID).firestore();
    await assertFails(getDoc(doc(db, 'people', 'person-1')));
  });

  it('denies reads from a deactivated account', async () => {
    const db = testEnv.authenticatedContext(INACTIVE_UID).firestore();
    await assertFails(getDoc(doc(db, 'people', 'person-1')));
  });

  it('allows reads from an approved presidency account', async () => {
    const db = testEnv.authenticatedContext(PRESIDENT_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'people', 'person-1')));
  });

  it('allows reads from an approved high council account', async () => {
    const db = testEnv.authenticatedContext(COUNCILOR_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'people', 'person-1')));
  });

  it('denies writes from an unapproved account', async () => {
    const db = testEnv.authenticatedContext(UNAPPROVED_UID).firestore();
    await assertFails(setDoc(doc(db, 'people', 'person-2'), { name: 'x' }));
  });

  it('denies writes from high council (presidency-only)', async () => {
    const db = testEnv.authenticatedContext(COUNCILOR_UID).firestore();
    await assertFails(setDoc(doc(db, 'people', 'person-2'), { name: 'x' }));
  });
});

describe('users (the authorization table itself)', () => {
  it('lets a signed-in account read only its own doc', async () => {
    const db = testEnv.authenticatedContext(COUNCILOR_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'users', COUNCILOR_UID)));
    await assertFails(getDoc(doc(db, 'users', PRESIDENT_UID)));
  });

  it('denies unauthenticated reads', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'users', PRESIDENT_UID)));
  });

  it('is never writable from the client, not even by presidency', async () => {
    const db = testEnv.authenticatedContext(PRESIDENT_UID).firestore();
    await assertFails(
      setDoc(doc(db, 'users', 'new-uid'), { role: 'stake_presidency', active: true }),
    );
    await assertFails(
      setDoc(doc(db, 'users', PRESIDENT_UID), { role: 'stake_presidency', active: true }),
    );
    await assertFails(deleteDoc(doc(db, 'users', COUNCILOR_UID)));
  });
});

describe.each(['callingWorkflows', 'priesthoodAdvancements', 'rosterSync'] as const)(
  '%s',
  (collection) => {
    const docId = collection === 'rosterSync' ? 'status' : 'wf-1';

    it('denies unauthenticated reads', async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(db, collection, docId)));
    });

    it('denies reads from an unapproved account', async () => {
      const db = testEnv.authenticatedContext(UNAPPROVED_UID).firestore();
      await assertFails(getDoc(doc(db, collection, docId)));
    });

    it('allows reads from an approved account', async () => {
      const db = testEnv.authenticatedContext(COUNCILOR_UID).firestore();
      await assertSucceeds(getDoc(doc(db, collection, docId)));
    });
  },
);

describe('callingWorkflows - Finalizing stage', () => {
  // A stake-wide workflow already partway through Finalizing - one unit
  // in, not yet recorded or set apart - the window isHighCouncilSustain/
  // isHighCouncilMarkSustainedUnit/isHighCouncilSetApart had to be
  // widened to also cover (see firestore.rules).
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'callingWorkflows', 'wf-finalizing'), {
        workflowType: 'calling',
        status: 'sustained',
        sustainedInUnits: ['900101'],
      });
    });
  });

  it('lets a high councilor mark a second unit sustained while already at `sustained`', async () => {
    const db = testEnv.authenticatedContext(COUNCILOR_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'callingWorkflows', 'wf-finalizing'), {
        status: 'sustained',
        sustainedInUnits: ['900101', '900102'],
        updatedAt: new Date(),
        updatedBy: COUNCILOR_UID,
      }),
    );
  });

  it('does not let a high councilor mark a workflow recorded in LCR - presidency only', async () => {
    const db = testEnv.authenticatedContext(COUNCILOR_UID).firestore();
    await assertFails(
      updateDoc(doc(db, 'callingWorkflows', 'wf-finalizing'), {
        status: 'recorded_in_lcr',
        recordedDate: new Date(),
        updatedAt: new Date(),
        updatedBy: COUNCILOR_UID,
      }),
    );
  });

  it('lets the presidency bulk-mark every outstanding unit sustained', async () => {
    const db = testEnv.authenticatedContext(PRESIDENT_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'callingWorkflows', 'wf-finalizing'), {
        status: 'sustained',
        sustainedInUnits: ['900101', '900102'],
        sustainedByPresidencyUnits: ['900102'],
        sustainedDate: new Date(),
        updatedAt: new Date(),
        updatedBy: PRESIDENT_UID,
      }),
    );
  });

  it('lets a high councilor set apart under their own name without a performer field', async () => {
    const db = testEnv.authenticatedContext(COUNCILOR_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'callingWorkflows', 'wf-finalizing'), {
        status: 'set_apart',
        setApartDate: new Date(),
        setApartBy: 'Councilor',
        updatedAt: new Date(),
        updatedBy: COUNCILOR_UID,
      }),
    );
  });

  it('does not let a high councilor set apart under someone else\'s name', async () => {
    const db = testEnv.authenticatedContext(COUNCILOR_UID).firestore();
    await assertFails(
      updateDoc(doc(db, 'callingWorkflows', 'wf-finalizing'), {
        status: 'set_apart',
        setApartDate: new Date(),
        setApartBy: 'Someone Else',
        updatedAt: new Date(),
        updatedBy: COUNCILOR_UID,
      }),
    );
  });

  it('lets a high councilor log an early set-apart while status stays sustained (not fully sustained yet)', async () => {
    const db = testEnv.authenticatedContext(COUNCILOR_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'callingWorkflows', 'wf-finalizing'), {
        status: 'sustained',
        setApartDate: new Date(),
        setApartBy: 'Councilor',
        updatedAt: new Date(),
        updatedBy: COUNCILOR_UID,
      }),
    );
  });
});

describe('callingWorkflows - undoing an early set-apart', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'callingWorkflows', 'wf-early-set-apart'), {
        workflowType: 'calling',
        status: 'sustained',
        sustainedInUnits: ['900101'],
        setApartDate: new Date(),
        setApartBy: 'Councilor',
      });
    });
  });

  it('lets a high councilor undo an early set-apart while status stays sustained', async () => {
    const db = testEnv.authenticatedContext(COUNCILOR_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'callingWorkflows', 'wf-early-set-apart'), {
        status: 'sustained',
        setApartDate: deleteField(),
        setApartBy: deleteField(),
        updatedAt: new Date(),
        updatedBy: COUNCILOR_UID,
      }),
    );
  });

  it('does not let a high councilor sneak a new set-apart name in through the undo path', async () => {
    const db = testEnv.authenticatedContext(COUNCILOR_UID).firestore();
    await assertFails(
      updateDoc(doc(db, 'callingWorkflows', 'wf-early-set-apart'), {
        status: 'sustained',
        setApartBy: 'Someone Else',
        updatedAt: new Date(),
        updatedBy: COUNCILOR_UID,
      }),
    );
  });

  it('does not let a high councilor undo a set-apart that already advanced status - presidency only', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'callingWorkflows', 'wf-fully-set-apart'), {
        workflowType: 'calling',
        status: 'set_apart',
        sustainedInUnits: ['900101'],
        setApartDate: new Date(),
        setApartBy: 'Councilor',
      });
    });
    const db = testEnv.authenticatedContext(COUNCILOR_UID).firestore();
    await assertFails(
      updateDoc(doc(db, 'callingWorkflows', 'wf-fully-set-apart'), {
        status: 'sustained',
        setApartDate: deleteField(),
        setApartBy: deleteField(),
        updatedAt: new Date(),
        updatedBy: COUNCILOR_UID,
      }),
    );
  });
});

describe('diagnostics (intentionally open to any signed-in user)', () => {
  it('lets a signed-in account read/write only its own ping doc', async () => {
    const db = testEnv.authenticatedContext(UNAPPROVED_UID).firestore();
    await assertSucceeds(setDoc(doc(db, 'diagnostics', UNAPPROVED_UID), { ok: true }));
    await assertFails(setDoc(doc(db, 'diagnostics', 'someone-else'), { ok: true }));
  });

  it('denies unauthenticated access', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'diagnostics', 'anyone')));
  });
});

describe('callingWorkflows - high council votes are calling-only', () => {
  // The high council weighs in on who gets CALLED, not who gets released:
  // RELEASE_STATUS_ORDER has no `high_council_approved` rung, so a vote
  // recorded against a release could never advance anything.
  //
  // Both documents sit at `presidency_approved` and differ only by
  // workflowType, which is exactly the distinction the rules missed - the
  // vote clause keyed on status alone, so a release of an HC-approved
  // calling was writable. The UI never offered the button (the detail page
  // had the guard the shared predicate lacked), but the boundary is the
  // rules, not the UI.
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const base = {
        status: 'presidency_approved',
        callingName: 'Elders Quorum President',
        hcApprovalUids: [],
        hcConcernUids: [],
        hcRequired: 9,
      };
      await setDoc(doc(ctx.firestore(), 'callingWorkflows', 'wf-call-open'), {
        ...base,
        workflowType: 'calling',
      });
      await setDoc(doc(ctx.firestore(), 'callingWorkflows', 'wf-release-open'), {
        ...base,
        workflowType: 'release',
      });
    });
  });

  it('lets a high councilor approve a CALLING at presidency_approved', async () => {
    const db = testEnv.authenticatedContext(COUNCILOR_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'callingWorkflows', 'wf-call-open'), {
        hcApprovalUids: [COUNCILOR_UID],
        updatedAt: new Date(),
        updatedBy: COUNCILOR_UID,
      }),
    );
  });

  it('does NOT let a high councilor approve a RELEASE', async () => {
    const db = testEnv.authenticatedContext(COUNCILOR_UID).firestore();
    await assertFails(
      updateDoc(doc(db, 'callingWorkflows', 'wf-release-open'), {
        hcApprovalUids: [COUNCILOR_UID],
        updatedAt: new Date(),
        updatedBy: COUNCILOR_UID,
      }),
    );
  });

  it('does NOT let a high councilor raise a concern on a RELEASE', async () => {
    const db = testEnv.authenticatedContext(COUNCILOR_UID).firestore();
    await assertFails(
      updateDoc(doc(db, 'callingWorkflows', 'wf-release-open'), {
        hcConcernUids: [COUNCILOR_UID],
        updatedAt: new Date(),
        updatedBy: COUNCILOR_UID,
      }),
    );
  });

  it('does NOT let a high councilor advance a RELEASE to high_council_approved', async () => {
    // Quorum is seeded as already met, so only the release check can fail
    // this - it isn't passing merely for want of approvals.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'callingWorkflows', 'wf-release-open'), {
        workflowType: 'release',
        status: 'presidency_approved',
        callingName: 'Elders Quorum President',
        hcApprovalUids: Array.from({ length: 9 }, (_, i) => `hc${i}`),
        hcConcernUids: [],
        hcRequired: 9,
      });
    });
    const db = testEnv.authenticatedContext(COUNCILOR_UID).firestore();
    await assertFails(
      updateDoc(doc(db, 'callingWorkflows', 'wf-release-open'), {
        status: 'high_council_approved',
        highCouncilApprovedDate: new Date(),
        updatedAt: new Date(),
        updatedBy: COUNCILOR_UID,
      }),
    );
  });
});
