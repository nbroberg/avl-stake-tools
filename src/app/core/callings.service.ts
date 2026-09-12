import { Injectable, inject } from '@angular/core';
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  limit,
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
import { DATE_FIELD_BY_STATUS, getPreviousStatus } from './calling-status';
import { HC_QUORUM_REQUIRED } from './quorum';
import { RosterSyncService } from './roster-sync.service';
import { isFullySustained, requiredUnitsFor } from './sunday-visit';
import { unitLabel } from './units';
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

/** The three independent Finalizing facts recomputeStatus derives `status` from. */
interface FinalizingFacts {
  fullySustained: boolean;
  recorded: boolean;
  setApart: boolean;
}

@Injectable({ providedIn: 'root' })
export class CallingsService {
  private readonly rosterSync = inject(RosterSyncService);

  /**
   * @param filters.limit Caps how many docs the query pulls, newest first.
   *   Omit to fetch every workflow (needed by lookups that must find any
   *   given workflow, e.g. the dashboard counts and detail pages).
   */
  listWorkflows(filters?: { unit?: string; limit?: number }): Observable<CallingWorkflow[]> {
    return new Observable<CallingWorkflow[]>((subscriber) => {
      const q = query(
        collection(db, COLLECTION),
        ...(filters?.unit ? [where('unit', '==', filters.unit)] : []),
        orderBy('createdAt', 'desc'),
        ...(filters?.limit ? [limit(filters.limit)] : []),
      );

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

  /**
   * `status` beyond `sustained` is a *derivation* of three independent
   * facts (fully sustained, recorded in LCR, set apart), not something
   * any caller decides directly - see markUnitSustained,
   * markAllUnitsSustained, logSetApart and recordInLcr below, all of
   * which end by calling this. `complete` requires all three (a release
   * has no set-apart leg, so it only needs the other two); short of
   * that, `status` rests at whichever of `recorded_in_lcr`/`set_apart`
   * reflects what's true - or `sustained` if nothing beyond sustaining
   * has happened yet, or sustaining itself isn't yet full. This keeps
   * every existing status literal in the same order they already have
   * (proposed..accepted/released, sustained, set_apart, recorded_in_lcr,
   * complete) - nothing new is introduced - it's just no longer *this
   * method's caller's job* to decide which of the last few to land on.
   */
  private nextStatus(
    workflowType: CallingWorkflowType,
    facts: FinalizingFacts,
  ): CallingStatus | ReleaseStatus {
    if (!facts.fullySustained) return 'sustained';
    const closed = facts.recorded && (workflowType === 'release' || facts.setApart);
    if (closed) return 'complete';
    if (facts.recorded) return 'recorded_in_lcr';
    if (facts.setApart) return 'set_apart';
    return 'sustained';
  }

  /**
   * Whether Finalizing has begun - guards logSetApart/undoSetApart and
   * recordInLcr/undoRecordInLcr, which only make sense once at least one
   * unit has sustained the workflow (spec: setting apart "can be logged
   * any time once the calling is in Finalizing"; the LCR Recording page
   * only lists callings at least one unit has sustained). Calling one of
   * those before then would otherwise compute `nextStatus` against an
   * empty sustaining checklist and wrongly land on `sustained`.
   */
  private hasEnteredFinalizing(status: string): boolean {
    return status === 'sustained' || status === 'set_apart' || status === 'recorded_in_lcr';
  }

  async advanceStatus(
    workflow: Pick<CallingWorkflow, 'id' | 'workflowType' | 'unit'>,
    newStatus: string,
    actor: AppUser,
    options: AdvanceStatusOptions = {},
  ): Promise<void> {
    const ref = doc(db, COLLECTION, workflow.id);
    const dateField = DATE_FIELD_BY_STATUS[newStatus];
    const assignedTo = newStatus === 'interview_assigned' ? options.assignedTo?.trim() : undefined;
    const setApartBy = newStatus === 'set_apart' ? options.setApartBy?.trim() : undefined;
    // A ward/branch calling has no sustaining checklist of its own -
    // reaching `sustained` here IS its one required unit's sustaining
    // vote, so keep `sustainedInUnits` consistent with that. Every other
    // Finalizing helper (isFullySustained, markUnitSustained, etc.) reads
    // that field for every workflow now, not just stake-wide ones.
    const sustainsOwnUnit = newStatus === 'sustained' && !!workflow.unit;

    await runTransaction(db, async (tx) => {
      tx.update(ref, {
        status: newStatus,
        updatedBy: actor.firebaseUid,
        updatedAt: serverTimestamp(),
        ...(dateField ? { [dateField]: serverTimestamp() } : {}),
        ...(sustainsOwnUnit ? { sustainedInUnits: arrayUnion(workflow.unit as string) } : {}),
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

  /**
   * Undo the most recent status advance - for a mis-click or a step taken
   * out of order. Only meaningful on the strictly linear pre-Finalizing
   * chain (`proposed` through `accepted`/`released`); once a workflow has
   * any unit sustained, undoing is the three dedicated actions below
   * (unmarkUnitSustained/undoMarkAllUnitsSustained, undoSetApart,
   * undoRecordInLcr) instead, since those track independent facts a
   * single "roll back one status" step can't safely unwind.
   */
  async rollbackStatus(
    workflow: Pick<CallingWorkflow, 'id' | 'workflowType' | 'callingName' | 'status'>,
    actor: AppUser,
    note?: string,
  ): Promise<void> {
    if (
      workflow.status === 'sustained' ||
      workflow.status === 'set_apart' ||
      workflow.status === 'recorded_in_lcr' ||
      workflow.status === 'complete'
    ) {
      return;
    }

    const previousStatus = getPreviousStatus(
      workflow.workflowType,
      workflow.status,
      workflow.callingName,
    );
    if (!previousStatus) return;

    const dateField = DATE_FIELD_BY_STATUS[workflow.status];

    await updateDoc(doc(db, COLLECTION, workflow.id), {
      status: previousStatus,
      updatedBy: actor.firebaseUid,
      updatedAt: serverTimestamp(),
      ...(dateField ? { [dateField]: deleteField() } : {}),
      ...(workflow.status === 'interview_assigned' ? { assignedTo: deleteField() } : {}),
    });

    await addDoc(collection(db, COLLECTION, workflow.id, 'history'), {
      status: previousStatus,
      changedBy: actor.firebaseUid,
      changedByName: actor.displayName,
      changedAt: serverTimestamp(),
      note: note?.trim()
        ? `Rolled back by the stake presidency. ${note.trim()}`
        : 'Rolled back by the stake presidency.',
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
   * Delete a calling or release workflow outright - for entries created in
   * error, duplicated, or otherwise never meant to exist. Presidency-only
   * (see firestore.rules). The `history` subcollection is append-only by
   * rule and is deliberately left behind rather than deleted, so the audit
   * trail survives even a mistaken workflow's removal.
   */
  async deleteWorkflow(workflowId: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTION, workflowId));
  }

  /**
   * Record that a workflow has been sustained in one more unit - a ward/
   * branch workflow has exactly one required unit (see
   * core/sunday-visit.ts's requiredUnitsFor), a stake-wide one needs
   * every unit in the stake. The first unit recorded from `accepted`/
   * `released` moves `status` to `sustained` - that's entering
   * Finalizing. Reaching every required unit stamps `sustainedDate` and
   * lets `status` advance further still, in case LCR recording and/or
   * setting apart were already logged early (see nextStatus).
   */
  async markUnitSustained(
    workflow: Pick<
      CallingWorkflow,
      'id' | 'workflowType' | 'unit' | 'sustainedInUnits' | 'sustainedByPresidencyUnits' | 'recordedDate' | 'setApartDate'
    >,
    unitNumber: string,
    actor: AppUser,
  ): Promise<void> {
    const wasStarted = (workflow.sustainedInUnits ?? []).length > 0;
    const wasFullySustained = isFullySustained(workflow);
    const nowFullySustained = isFullySustained({
      ...workflow,
      sustainedInUnits: [...(workflow.sustainedInUnits ?? []), unitNumber],
    });
    const status = this.nextStatus(workflow.workflowType, {
      fullySustained: nowFullySustained,
      recorded: !!workflow.recordedDate,
      setApart: !!workflow.setApartDate,
    });

    await updateDoc(doc(db, COLLECTION, workflow.id), {
      sustainedInUnits: arrayUnion(unitNumber),
      // A genuine self-report supersedes an earlier "marked by the stake
      // presidency" flag for this same unit.
      ...((workflow.sustainedByPresidencyUnits ?? []).includes(unitNumber)
        ? { sustainedByPresidencyUnits: arrayRemove(unitNumber) }
        : {}),
      status,
      ...(nowFullySustained && !wasFullySustained ? { sustainedDate: serverTimestamp() } : {}),
      ...(status === 'complete' ? { completedDate: serverTimestamp() } : {}),
      updatedBy: actor.firebaseUid,
      updatedAt: serverTimestamp(),
    });

    // Only the two real milestones - the first unit in (entering
    // Finalizing) and the last one (fully sustained) - are worth an
    // audit line; the routine check-ins between them stay silent, same
    // as before.
    if (!wasStarted || (nowFullySustained && !wasFullySustained)) {
      const noteParts: string[] = [];
      if (!wasStarted) noteParts.push('Sustaining begun.');
      if (nowFullySustained && !wasFullySustained) noteParts.push('Sustained in every unit.');
      if (status === 'complete') noteParts.push('This closes the workflow.');
      await addDoc(collection(db, COLLECTION, workflow.id, 'history'), {
        status,
        changedBy: actor.firebaseUid,
        changedByName: actor.displayName,
        changedAt: serverTimestamp(),
        note: noteParts.join(' '),
      });
    }
  }

  /** Undo a mis-click - removes one unit from the sustained-in list. */
  async unmarkUnitSustained(
    workflow: Pick<
      CallingWorkflow,
      'id' | 'workflowType' | 'unit' | 'sustainedInUnits' | 'recordedDate' | 'setApartDate'
    >,
    unitNumber: string,
    actor: AppUser,
  ): Promise<void> {
    const remainingUnits = (workflow.sustainedInUnits ?? []).filter((u) => u !== unitNumber);
    const status = this.statusAfterRemovingUnits(workflow, remainingUnits);

    await updateDoc(doc(db, COLLECTION, workflow.id), {
      sustainedInUnits: arrayRemove(unitNumber),
      sustainedByPresidencyUnits: arrayRemove(unitNumber),
      status,
      ...(isFullySustained({ ...workflow, sustainedInUnits: remainingUnits })
        ? {}
        : { sustainedDate: deleteField() }),
      ...(status === 'complete' ? {} : { completedDate: deleteField() }),
      updatedBy: actor.firebaseUid,
      updatedAt: serverTimestamp(),
    });
  }

  /**
   * Stake Presidency bulk action: marks every required unit that hasn't
   * yet reported as sustained, in one write. Units that already reported
   * keep their own sustaining details; only the newly-added ones are
   * flagged in `sustainedByPresidencyUnits` (see
   * CallingWorkflow.sustainedByPresidencyUnits and
   * undoMarkAllUnitsSustained), so they're both distinguishable in the
   * UI and selectively undoable. No-ops (returns an empty list) if every
   * required unit already reported. Returns the units it marked, for the
   * caller's confirmation UI / toast.
   */
  async markAllUnitsSustained(
    workflow: Pick<
      CallingWorkflow,
      'id' | 'workflowType' | 'unit' | 'sustainedInUnits' | 'recordedDate' | 'setApartDate'
    >,
    actor: AppUser,
  ): Promise<string[]> {
    const done = new Set(workflow.sustainedInUnits ?? []);
    const missing = requiredUnitsFor(workflow).filter((u) => !done.has(u));
    if (missing.length === 0) return [];

    // Adding every missing unit necessarily completes the sustaining.
    const status = this.nextStatus(workflow.workflowType, {
      fullySustained: true,
      recorded: !!workflow.recordedDate,
      setApart: !!workflow.setApartDate,
    });

    await updateDoc(doc(db, COLLECTION, workflow.id), {
      sustainedInUnits: arrayUnion(...missing),
      sustainedByPresidencyUnits: arrayUnion(...missing),
      status,
      sustainedDate: serverTimestamp(),
      ...(status === 'complete' ? { completedDate: serverTimestamp() } : {}),
      updatedBy: actor.firebaseUid,
      updatedAt: serverTimestamp(),
    });

    await addDoc(collection(db, COLLECTION, workflow.id, 'history'), {
      status,
      changedBy: actor.firebaseUid,
      changedByName: actor.displayName,
      changedAt: serverTimestamp(),
      note:
        `Marked sustained by the Stake Presidency: ${missing.map(unitLabel).join(', ')}.` +
        (status === 'complete' ? ' This closes the workflow.' : ''),
    });

    return missing;
  }

  /**
   * Undo markAllUnitsSustained - removes exactly the units that bulk
   * action added (`sustainedByPresidencyUnits`), leaving any unit that
   * separately self-reported (before or since) untouched. No-op if
   * nothing was ever bulk-marked.
   */
  async undoMarkAllUnitsSustained(
    workflow: Pick<
      CallingWorkflow,
      | 'id'
      | 'workflowType'
      | 'unit'
      | 'sustainedInUnits'
      | 'sustainedByPresidencyUnits'
      | 'recordedDate'
      | 'setApartDate'
    >,
    actor: AppUser,
  ): Promise<void> {
    const marked = workflow.sustainedByPresidencyUnits ?? [];
    if (marked.length === 0) return;

    const remainingUnits = (workflow.sustainedInUnits ?? []).filter((u) => !marked.includes(u));
    const status = this.statusAfterRemovingUnits(workflow, remainingUnits);

    await updateDoc(doc(db, COLLECTION, workflow.id), {
      sustainedInUnits: arrayRemove(...marked),
      sustainedByPresidencyUnits: arrayRemove(...marked),
      status,
      ...(isFullySustained({ ...workflow, sustainedInUnits: remainingUnits })
        ? {}
        : { sustainedDate: deleteField() }),
      ...(status === 'complete' ? {} : { completedDate: deleteField() }),
      updatedBy: actor.firebaseUid,
      updatedAt: serverTimestamp(),
    });

    await addDoc(collection(db, COLLECTION, workflow.id, 'history'), {
      status,
      changedBy: actor.firebaseUid,
      changedByName: actor.displayName,
      changedAt: serverTimestamp(),
      note: `Undid the Stake Presidency's sustaining mark for: ${marked.map(unitLabel).join(', ')}.`,
    });
  }

  /**
   * Shared by unmarkUnitSustained/undoMarkAllUnitsSustained: what
   * `status` should become once `remainingUnits` is what's left after
   * removing some units. If literally nothing has happened yet (no
   * units, no recording, no setting apart), this genuinely reverts to
   * the pre-Finalizing status; otherwise nextStatus already handles a
   * drop below full sustaining correctly (it always rests at `sustained`
   * whenever `fullySustained` is false, regardless of the other facts).
   */
  private statusAfterRemovingUnits(
    workflow: Pick<CallingWorkflow, 'workflowType' | 'unit' | 'recordedDate' | 'setApartDate'>,
    remainingUnits: string[],
  ): CallingStatus | ReleaseStatus {
    const nothingLeft = remainingUnits.length === 0 && !workflow.recordedDate && !workflow.setApartDate;
    if (nothingLeft) {
      return workflow.workflowType === 'release' ? 'released' : 'accepted';
    }
    return this.nextStatus(workflow.workflowType, {
      fullySustained: isFullySustained({ ...workflow, sustainedInUnits: remainingUnits }),
      recorded: !!workflow.recordedDate,
      setApart: !!workflow.setApartDate,
    });
  }

  /**
   * Sustain and set apart in one write - used when the person being
   * released or called is physically present with the presidency member
   * or high councilor recording it (see core/sunday-visit.ts's
   * canCombineSustainAndSetApart - no longer required to be the unit
   * that completes a stake-wide calling's sustaining, just the person's
   * own unit). For a stake-wide workflow this also folds in the visited
   * unit's sustaining mark; a ward/branch workflow has no checklist, so
   * its own `unit` is what gets folded in instead.
   */
  async sustainAndSetApart(
    workflow: Pick<CallingWorkflow, 'id' | 'workflowType' | 'unit' | 'sustainedInUnits' | 'recordedDate'>,
    unitNumber: string | undefined,
    actor: AppUser,
  ): Promise<void> {
    const unitToAdd = unitNumber ?? workflow.unit;
    const wasFullySustained = isFullySustained(workflow);
    const updatedUnits = unitToAdd
      ? [...(workflow.sustainedInUnits ?? []), unitToAdd]
      : (workflow.sustainedInUnits ?? []);
    const nowFullySustained = isFullySustained({ ...workflow, sustainedInUnits: updatedUnits });
    const status = this.nextStatus(workflow.workflowType, {
      fullySustained: nowFullySustained,
      recorded: !!workflow.recordedDate,
      setApart: true,
    });

    await updateDoc(doc(db, COLLECTION, workflow.id), {
      status,
      setApartDate: serverTimestamp(),
      setApartBy: actor.displayName,
      ...(unitToAdd ? { sustainedInUnits: arrayUnion(unitToAdd) } : {}),
      ...(nowFullySustained && !wasFullySustained ? { sustainedDate: serverTimestamp() } : {}),
      ...(status === 'complete' ? { completedDate: serverTimestamp() } : {}),
      updatedBy: actor.firebaseUid,
      updatedAt: serverTimestamp(),
    });
    await addDoc(collection(db, COLLECTION, workflow.id, 'history'), {
      status,
      changedBy: actor.firebaseUid,
      changedByName: actor.displayName,
      changedAt: serverTimestamp(),
      note:
        `Sustained and set apart by ${actor.displayName} in the same visit.` +
        (status === 'complete' ? ' This closes the workflow.' : ''),
    });
  }

  /**
   * Log that the person was set apart - the date, and (optionally, as
   * today) who performed it. Callable any time once Finalizing has
   * begun (`status` is `sustained` or `recorded_in_lcr`), independent of
   * whether sustaining is fully done or LCR recording has happened -
   * see nextStatus. Replaces advanceStatus(w, 'set_apart', ...) as the
   * write path for this step.
   */
  async logSetApart(
    workflow: Pick<CallingWorkflow, 'id' | 'workflowType' | 'unit' | 'status' | 'sustainedInUnits' | 'recordedDate'>,
    actor: AppUser,
    setApartBy?: string,
  ): Promise<void> {
    if (!this.hasEnteredFinalizing(workflow.status)) return;
    const status = this.nextStatus(workflow.workflowType, {
      fullySustained: isFullySustained(workflow),
      recorded: !!workflow.recordedDate,
      setApart: true,
    });
    const trimmedSetApartBy = setApartBy?.trim();

    await updateDoc(doc(db, COLLECTION, workflow.id), {
      status,
      setApartDate: serverTimestamp(),
      ...(trimmedSetApartBy ? { setApartBy: trimmedSetApartBy } : {}),
      ...(status === 'complete' ? { completedDate: serverTimestamp() } : {}),
      updatedBy: actor.firebaseUid,
      updatedAt: serverTimestamp(),
    });

    const noteParts = ['Set apart.'];
    if (trimmedSetApartBy) noteParts.push(`Set apart by ${trimmedSetApartBy}.`);
    if (status === 'complete') noteParts.push('This closes the workflow.');
    await addDoc(collection(db, COLLECTION, workflow.id, 'history'), {
      status,
      changedBy: actor.firebaseUid,
      changedByName: actor.displayName,
      changedAt: serverTimestamp(),
      note: noteParts.join(' '),
    });
  }

  /** Undo a set-apart log - for a mis-click, or one recorded too early. */
  async undoSetApart(
    workflow: Pick<CallingWorkflow, 'id' | 'workflowType' | 'unit' | 'status' | 'sustainedInUnits' | 'recordedDate'>,
    actor: AppUser,
  ): Promise<void> {
    if (!this.hasEnteredFinalizing(workflow.status)) return;
    const status = this.nextStatus(workflow.workflowType, {
      fullySustained: isFullySustained(workflow),
      recorded: !!workflow.recordedDate,
      setApart: false,
    });

    await updateDoc(doc(db, COLLECTION, workflow.id), {
      status,
      setApartDate: deleteField(),
      setApartBy: deleteField(),
      ...(status === 'complete' ? {} : { completedDate: deleteField() }),
      updatedBy: actor.firebaseUid,
      updatedAt: serverTimestamp(),
    });

    await addDoc(collection(db, COLLECTION, workflow.id, 'history'), {
      status,
      changedBy: actor.firebaseUid,
      changedByName: actor.displayName,
      changedAt: serverTimestamp(),
      note: 'Setting apart undone.',
    });
  }

  /**
   * Mark that this workflow has been recorded in LCR - manually, by the
   * Stake Presidency, outside the app; this only records that it
   * happened, when, and by whom (via the audit history below). Callable
   * any time once Finalizing has begun, independent of setting apart -
   * see nextStatus. Deliberately does NOT close the workflow by itself
   * unless sustaining and setting apart (for a calling) are also already
   * done. Presidency-only (see firestore.rules and core/roles.ts).
   */
  async recordInLcr(
    workflow: Pick<CallingWorkflow, 'id' | 'workflowType' | 'unit' | 'status' | 'sustainedInUnits' | 'setApartDate'>,
    actor: AppUser,
  ): Promise<void> {
    if (!this.hasEnteredFinalizing(workflow.status)) return;
    const status = this.nextStatus(workflow.workflowType, {
      fullySustained: isFullySustained(workflow),
      recorded: true,
      setApart: !!workflow.setApartDate,
    });

    await updateDoc(doc(db, COLLECTION, workflow.id), {
      status,
      recordedDate: serverTimestamp(),
      ...(status === 'complete' ? { completedDate: serverTimestamp() } : {}),
      updatedBy: actor.firebaseUid,
      updatedAt: serverTimestamp(),
    });

    const noteParts = ['Recorded in LCR.'];
    if (status === 'complete') noteParts.push('This closes the workflow.');
    await addDoc(collection(db, COLLECTION, workflow.id, 'history'), {
      status,
      changedBy: actor.firebaseUid,
      changedByName: actor.displayName,
      changedAt: serverTimestamp(),
      note: noteParts.join(' '),
    });

    // The local roster may now be behind LCR - see RosterSyncService.
    await this.rosterSync.flagRequired(actor);
  }

  /** Undo an LCR-recorded mark - for a mis-click, or one recorded too early. */
  async undoRecordInLcr(
    workflow: Pick<CallingWorkflow, 'id' | 'workflowType' | 'unit' | 'status' | 'sustainedInUnits' | 'setApartDate'>,
    actor: AppUser,
  ): Promise<void> {
    if (!this.hasEnteredFinalizing(workflow.status)) return;
    const status = this.nextStatus(workflow.workflowType, {
      fullySustained: isFullySustained(workflow),
      recorded: false,
      setApart: !!workflow.setApartDate,
    });

    await updateDoc(doc(db, COLLECTION, workflow.id), {
      status,
      recordedDate: deleteField(),
      ...(status === 'complete' ? {} : { completedDate: deleteField() }),
      updatedBy: actor.firebaseUid,
      updatedAt: serverTimestamp(),
    });

    await addDoc(collection(db, COLLECTION, workflow.id, 'history'), {
      status,
      changedBy: actor.firebaseUid,
      changedByName: actor.displayName,
      changedAt: serverTimestamp(),
      note: 'LCR recording undone.',
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
