import { Injectable } from '@angular/core';
import {
  addDoc,
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
import type {
  AppUser,
  CallingStatus,
  CallingStatusHistoryEntry,
  CallingWorkflow,
  CallingWorkflowType,
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
   * Record a High Council member's approval on a workflow sitting at
   * `presidency_approved`. Uses arrayUnion so the field converges even
   * if a double-tap fires two writes in quick succession, and also
   * writes an audit-history entry naming the voter. Rules enforce that
   * the caller can only add their own UID (see firestore.rules).
   */
  async approveByHighCouncil(workflowId: string, actor: AppUser): Promise<void> {
    await updateDoc(doc(db, COLLECTION, workflowId), {
      hcApprovalUids: arrayUnion(actor.firebaseUid),
      updatedBy: actor.firebaseUid,
      updatedAt: serverTimestamp(),
    });
    await addDoc(collection(db, COLLECTION, workflowId, 'history'), {
      status: 'presidency_approved',
      changedBy: actor.firebaseUid,
      changedByName: actor.displayName,
      changedAt: serverTimestamp(),
      note: 'High Council approval recorded.',
    } satisfies WithFieldValue<Omit<CallingStatusHistoryEntry, 'id'>>);
  }
}
