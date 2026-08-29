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
import { DATE_FIELD_BY_ADVANCEMENT_STATUS } from './advancement-status';
import { HC_QUORUM_REQUIRED } from './quorum';
import type {
  AdvancementHistoryEntry,
  AdvancementStatus,
  AppUser,
  HistoryEntryKind,
  PriesthoodAdvancementType,
  PriesthoodAdvancementWorkflow,
} from '../models/types';

const COLLECTION = 'priesthoodAdvancements';

export interface NewAdvancementWorkflowInput {
  advancementType: PriesthoodAdvancementType;
  personId: string;
  personName: string;
  /** Ward or branch unit number; omitted for a stake-level record. */
  unit?: string;
  notes?: string;
}

export interface AdvanceAdvancementStatusOptions {
  /** Display name of who performed the ordination. Required when
   *  advancing to `ordained`; ignored otherwise. */
  ordainedBy?: string;
  /** Optional per-transition note appended to the audit history. */
  note?: string;
}

/**
 * Firestore-backed service for priesthood advancements (Priest -> Elder,
 * Elder -> High Priest). Mirrors CallingsService's shape and semantics -
 * same high council vote mechanics via recordHcPosition - but against its
 * own collection and a shorter, bishop-free status ladder (see
 * core/advancement-status.ts).
 */
@Injectable({ providedIn: 'root' })
export class PriesthoodAdvancementsService {
  listWorkflows(filters?: { unit?: string }): Observable<PriesthoodAdvancementWorkflow[]> {
    return new Observable<PriesthoodAdvancementWorkflow[]>((subscriber) => {
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
          subscriber.next(
            snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PriesthoodAdvancementWorkflow),
          ),
        (err) => subscriber.error(err),
      );
    });
  }

  history(workflowId: string): Observable<AdvancementHistoryEntry[]> {
    return new Observable<AdvancementHistoryEntry[]>((subscriber) => {
      const q = query(
        collection(db, COLLECTION, workflowId, 'history'),
        orderBy('changedAt', 'asc'),
      );
      return onSnapshot(
        q,
        (snap) =>
          subscriber.next(
            snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AdvancementHistoryEntry),
          ),
        (err) => subscriber.error(err),
      );
    });
  }

  async create(input: NewAdvancementWorkflowInput, actor: AppUser): Promise<string> {
    const initialStatus: AdvancementStatus = 'proposed';
    const docRef = await addDoc(collection(db, COLLECTION), {
      ...input,
      status: initialStatus,
      proposedDate: serverTimestamp(),
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
    } satisfies WithFieldValue<Omit<AdvancementHistoryEntry, 'id'>>);

    return docRef.id;
  }

  async advanceStatus(
    workflow: Pick<PriesthoodAdvancementWorkflow, 'id'>,
    newStatus: string,
    actor: AppUser,
    options: AdvanceAdvancementStatusOptions = {},
  ): Promise<void> {
    const ref = doc(db, COLLECTION, workflow.id);
    const dateField = DATE_FIELD_BY_ADVANCEMENT_STATUS[newStatus];
    const ordainedBy = newStatus === 'ordained' ? options.ordainedBy?.trim() : undefined;

    await runTransaction(db, async (tx) => {
      tx.update(ref, {
        status: newStatus,
        updatedBy: actor.firebaseUid,
        updatedAt: serverTimestamp(),
        ...(dateField ? { [dateField]: serverTimestamp() } : {}),
        ...(ordainedBy ? { ordainedBy } : {}),
      });
    });

    const noteParts: string[] = [];
    if (ordainedBy) noteParts.push(`Ordained by ${ordainedBy}.`);
    if (options.note?.trim()) noteParts.push(options.note.trim());
    const note = noteParts.join(' ');

    await addDoc(collection(db, COLLECTION, workflow.id, 'history'), {
      status: newStatus,
      changedBy: actor.firebaseUid,
      changedByName: actor.displayName,
      changedAt: serverTimestamp(),
      ...(note ? { note } : {}),
    } satisfies WithFieldValue<Omit<AdvancementHistoryEntry, 'id'>>);
  }

  async updateNotes(workflowId: string, notes: string, actor: AppUser): Promise<void> {
    await updateDoc(doc(db, COLLECTION, workflowId), {
      notes,
      updatedBy: actor.firebaseUid,
      updatedAt: serverTimestamp(),
    });
  }

  /** See CallingsService.approveByHighCouncil - identical semantics. */
  async approveByHighCouncil(workflowId: string, actor: AppUser): Promise<void> {
    await this.recordHcPosition(workflowId, actor, {
      approve: true,
      kind: 'hc_approval',
      note: 'High Council approval recorded.',
    });
  }

  /** See CallingsService.withdrawHighCouncilApproval. */
  async withdrawHighCouncilApproval(workflowId: string, actor: AppUser): Promise<void> {
    await this.recordHcPosition(workflowId, actor, {
      approve: false,
      kind: 'hc_withdrawal',
      note: 'High Council approval withdrawn.',
    });
  }

  /** See CallingsService.raiseHighCouncilConcern. */
  async raiseHighCouncilConcern(workflowId: string, actor: AppUser): Promise<void> {
    await this.recordHcPosition(workflowId, actor, {
      concern: true,
      kind: 'hc_concern',
      note: 'High Council concern raised.',
    });
  }

  /** See CallingsService.clearHighCouncilConcern. */
  async clearHighCouncilConcern(workflowId: string, actor: AppUser): Promise<void> {
    await this.recordHcPosition(workflowId, actor, {
      concern: false,
      kind: 'hc_concern_cleared',
      note: 'High Council concern cleared.',
    });
  }

  /**
   * The one write shape behind all four high council actions - identical
   * pattern to CallingsService.recordHcPosition. See there for the
   * mutual-exclusion rationale.
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
    } satisfies WithFieldValue<Omit<AdvancementHistoryEntry, 'id'>>);
  }
}
