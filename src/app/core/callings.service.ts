import { Injectable } from '@angular/core';
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  type WithFieldValue,
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import { db } from './firebase';
import { DATE_FIELD_BY_STATUS } from './calling-status';
import { HC_QUORUM_REQUIRED } from './quorum';
import { completesSustaining } from './sunday-visit';
import type {
  AppUser,
  CallingStatus,
  CallingStatusHistoryEntry,
  CallingWorkflow,
  CallingWorkflowType,
  HistoryEntryKind,
  ReleaseStatus,
} from '../models/types';

const COLLECTION = 'callingWorkflows';

export interface NewCallingWorkflowInput {
  workflowType: CallingWorkflowType;
  personId: string;
  personName: string;
  callingName: string;
  /** Ward or branch unit number; omitted for stake-level callings. */
  unit?: string;
  notes?: string;
}

export interface AdvanceStatusOptions {
  /**
   * Display name of the presidency member responsible for interviewing
   * and extending the calling. Required when advancing to
   * `interview_assigned`; ignored otherwise. Restricted at the UI layer
   * to people whose current callings satisfy the calling's authorities
   * (see core/calling-authorities.ts).
   */
  assignedTo?: string;
  /**
   * Display name of the presidency member or high councilor who set the
   * person apart. Optional when advancing to `set_apart`; ignored
   * otherwise. Restricted to the same eligibility as `assignedTo`.
   */
  setApartBy?: string;
  /** Optional per-transition note appended to the audit history. */
  note?: string;
}

@Injectable({ providedIn: 'root' })
export class CallingsService {
  listWorkflows(filters?: { unit?: string }): Observable<CallingWorkflow[]> {
    return new Observable<CallingWorkflow[]>((subscriber) => {
      const q = filters?.unit
        ? query(
            collection(db, COLLECTION),
            where('unit', '==', filters.unit),
            orderBy('createdAt', 'desc'),
          )
        : query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));

      return onSnapshot(
        q,
        (snap) =>
          subscriber.next(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CallingWorkflow)),
        (err) => subscriber.error(err),
      );
    });
  }

  history(workflowId: string): Observable<CallingStatusHistoryEntry[]> {
    return new Observable<CallingStatusHistoryEntry[]>((subscriber) => {
      const q = query(
        collection(db, COLLECTION, workflowId, 'history'),
        orderBy('changedAt', 'asc'),
      );
      return onSnapshot(
        q,
        (snap) =>
          subscriber.next(
            snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CallingStatusHistoryEntry),
          ),
        (err) => subscriber.error(err),
      );
    });
  }

  async create(input: NewCallingWorkflowInput, actor: AppUser): Promise<string> {
    const initialStatus: CallingStatus | ReleaseStatus = 'proposed';
    const docRef = await addDoc(collection(db, COLLECTION), {
      ...input,
      status: initialStatus,
      proposedDate: serverTimestamp(),
      // Initialize empty approvals array and snapshot the quorum threshold
      // so mid-vote constant changes don't move the goalposts for this
      // workflow. Releases and stake-only workflows still carry the field;
      // they just never hit the presidency_approved -> high_council path
      // where the array is voted into.
      hcApprovalUids: [],
      hcConcernUids: [],
      hcRequired: HC_QUORUM_REQUIRED,
      createdBy: actor.firebaseUid,
      updatedBy: actor.firebaseUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await addDoc(collection(db, COLLECTION, docRef.id, 'history'), {
      status: initialStatus,
      changedBy: actor.firebaseUid,
      changedByName: actor.displayName,
      changedAt: serverTimestamp(),
      note: 'Workflow created.',
    } satisfies WithFieldValue<Omit<CallingStatusHistoryEntry, 'id'>>);

    return docRef.id;
  }

  async advanceStatus(
    workflow: Pick<CallingWorkflow, 'id' | 'workflowType'>,
    newStatus: string,
    actor: AppUser,
    options: AdvanceStatusOptions = {},
  ): Promise<void> {
    const ref = doc(db, COLLECTION, workflow.id);
    const dateField = DATE_FIELD_BY_STATUS[newStatus];
    const assignedTo = newStatus === 'interview_assigned' ? options.assignedTo?.trim() : undefined;
    const setApartBy = newStatus === 'set_apart' ? options.setApartBy?.trim() : undefined;

    await runTransaction(db, async (tx) => {
      tx.update(ref, {
        status: newStatus,
        updatedBy: actor.firebaseUid,
        updatedAt: serverTimestamp(),
        ...(dateField ? { [dateField]: serverTimestamp() } : {}),
        ...(assignedTo ? { assignedTo } : {}),
        ...(setApartBy ? { setApartBy } : {}),
      });
    });

    const noteParts: string[] = [];
    if (assignedTo) noteParts.push(`Assigned to ${assignedTo}.`);
    if (setApartBy) noteParts.push(`Set apart by ${setApartBy}.`);
    if (options.note?.trim()) noteParts.push(options.note.trim());
    const note = noteParts.join(' ');

    await addDoc(collection(db, COLLECTION, workflow.id, 'history'), {
      status: newStatus,
      changedBy: actor.firebaseUid,
      changedByName: actor.displayName,
      changedAt: serverTimestamp(),
      ...(note ? { note } : {}),
    } satisfies WithFieldValue<Omit<CallingStatusHistoryEntry, 'id'>>);
  }

  async updateNotes(workflowId: string, notes: string, actor: AppUser): Promise<void> {
    await updateDoc(doc(db, COLLECTION, workflowId), {
      notes,
      updatedBy: actor.firebaseUid,
      updatedAt: serverTimestamp(),
    });
  }

  /**
   * Record that a stake-level workflow has been sustained in one more
   * unit. Only meaningful while the workflow has no `unit` of its own
   * (see CallingWorkflow.sustainedInUnits) - the UI only offers this for
   * stake-wide callings/releases, but nothing here re-checks that, since
   * marking a unit on a ward-level workflow is harmless, just unused.
   *
   * When this unit is the last one needed (core/sunday-visit.ts's
   * completesSustaining), the status advances to `sustained` in the same
   * write - the caller doesn't need a separate "now click advance"
   * step once the checklist fills up.
   */
  async markUnitSustained(
    workflow: Pick<CallingWorkflow, 'id' | 'unit' | 'sustainedInUnits'>,
    unitNumber: string,
    actor: AppUser,
  ): Promise<void> {
    const complete = completesSustaining(workflow, unitNumber);
    await updateDoc(doc(db, COLLECTION, workflow.id), {
      sustainedInUnits: arrayUnion(unitNumber),
      ...(complete ? { status: 'sustained', sustainedDate: serverTimestamp() } : {}),
      updatedBy: actor.firebaseUid,
      updatedAt: serverTimestamp(),
    });
    if (complete) {
      await addDoc(collection(db, COLLECTION, workflow.id, 'history'), {
        status: 'sustained',
        changedBy: actor.firebaseUid,
        changedByName: actor.displayName,
        changedAt: serverTimestamp(),
        note: 'Sustained in every unit.',
      });
    }
  }

  /** Undo a mis-click - removes one unit from the sustained-in list. */
  async unmarkUnitSustained(workflowId: string, unitNumber: string, actor: AppUser): Promise<void> {
    await updateDoc(doc(db, COLLECTION, workflowId), {
      sustainedInUnits: arrayRemove(unitNumber),
      updatedBy: actor.firebaseUid,
      updatedAt: serverTimestamp(),
    });
  }

  /**
   * Sustain and set apart in one write - used when the person being
   * released or called is physically present with the presidency member
   * or high councilor right as the sustaining completes (see
   * core/sunday-visit.ts's canCombineSustainAndSetApart). For a
   * stake-wide workflow this also folds in the completing unit mark;
   * ward/branch workflows have no checklist, so `unitNumber` is omitted.
   */
  async sustainAndSetApart(
    workflow: Pick<CallingWorkflow, 'id'>,
    unitNumber: string | undefined,
    actor: AppUser,
  ): Promise<void> {
    await updateDoc(doc(db, COLLECTION, workflow.id), {
      status: 'set_apart',
      sustainedDate: serverTimestamp(),
      setApartDate: serverTimestamp(),
      setApartBy: actor.displayName,
      ...(unitNumber ? { sustainedInUnits: arrayUnion(unitNumber) } : {}),
      updatedBy: actor.firebaseUid,
      updatedAt: serverTimestamp(),
    });
    await addDoc(collection(db, COLLECTION, workflow.id, 'history'), {
      status: 'set_apart',
      changedBy: actor.firebaseUid,
      changedByName: actor.displayName,
      changedAt: serverTimestamp(),
      note: `Sustained and set apart by ${actor.displayName} in the same visit.`,
    });
  }

  /**
   * Record a High Council member's approval on a workflow sitting at
   * `presidency_approved`. Uses arrayUnion so the field converges even
   * if a double-tap fires two writes in quick succession, and clears any
   * concern the same member was holding, since the two are mutually
   * exclusive. Rules enforce that the caller can only move their own UID
   * (see firestore.rules).
   */
  async approveByHighCouncil(workflowId: string, actor: AppUser): Promise<void> {
    await this.recordHcPosition(workflowId, actor, {
      approve: true,
      kind: 'hc_approval',
      note: 'High Council approval recorded.',
    });
  }

  /**
   * Take back an approval. Only possible while the workflow is still at
   * `presidency_approved` - once it advances, the rules stop matching and
   * the recorded votes are frozen. The withdrawal is appended to the
   * audit trail rather than erasing the original entry.
   */
  async withdrawHighCouncilApproval(workflowId: string, actor: AppUser): Promise<void> {
    await this.recordHcPosition(workflowId, actor, {
      approve: false,
      kind: 'hc_withdrawal',
      note: 'High Council approval withdrawn.',
    });
  }

  /**
   * Register a concern instead of approving. This is deliberately not a
   * veto: it doesn't change the approval arithmetic, but it does block
   * the high council's own quorum-advance path, so the concern has to be
   * talked through and cleared - or the presidency has to advance the
   * workflow themselves, on the record.
   */
  async raiseHighCouncilConcern(workflowId: string, actor: AppUser): Promise<void> {
    await this.recordHcPosition(workflowId, actor, {
      concern: true,
      kind: 'hc_concern',
      note: 'High Council concern raised.',
    });
  }

  /** Withdraw a previously registered concern. */
  async clearHighCouncilConcern(workflowId: string, actor: AppUser): Promise<void> {
    await this.recordHcPosition(workflowId, actor, {
      concern: false,
      kind: 'hc_concern_cleared',
      note: 'High Council concern cleared.',
    });
  }

  /**
   * The one write shape behind all four high council actions: move the
   * caller's own UID between the approval and concern arrays and append a
   * matching audit entry. Approving clears a concern and raising a
   * concern drops an approval, so a member is never counted in both.
   */
  private async recordHcPosition(
    workflowId: string,
    actor: AppUser,
    move: {
      approve?: boolean;
      concern?: boolean;
      kind: HistoryEntryKind;
      note: string;
    },
  ): Promise<void> {
    const uid = actor.firebaseUid;
    const patch: Record<string, unknown> = {
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    };

    if (move.approve === true) {
      patch['hcApprovalUids'] = arrayUnion(uid);
      patch['hcConcernUids'] = arrayRemove(uid);
    } else if (move.approve === false) {
      patch['hcApprovalUids'] = arrayRemove(uid);
    }

    if (move.concern === true) {
      patch['hcConcernUids'] = arrayUnion(uid);
      patch['hcApprovalUids'] = arrayRemove(uid);
    } else if (move.concern === false) {
      patch['hcConcernUids'] = arrayRemove(uid);
    }

    await updateDoc(doc(db, COLLECTION, workflowId), patch);
    await addDoc(collection(db, COLLECTION, workflowId, 'history'), {
      status: 'presidency_approved',
      changedBy: uid,
      changedByName: actor.displayName,
      changedAt: serverTimestamp(),
      kind: move.kind,
      note: move.note,
    } satisfies WithFieldValue<Omit<CallingStatusHistoryEntry, 'id'>>);
  }
}
