import { Injectable } from '@angular/core';
import { Timestamp } from 'firebase/firestore';
import { BehaviorSubject, Observable, map } from 'rxjs';
import type {
  AdvanceStatusOptions,
  CallingsService,
  NewCallingWorkflowInput,
} from '../callings.service';
import { DATE_FIELD_BY_STATUS, getPreviousStatus } from '../calling-status';
import { HC_QUORUM_REQUIRED } from '../quorum';
import type {
  AppUser,
  CallingStatusHistoryEntry,
  CallingWorkflow,
  HistoryEntryKind,
} from '../../models/types';
import { demoHistory, demoWorkflows } from './demo-data';

/**
 * In-memory stand-in for CallingsService. Mutations mirror the real
 * service's semantics - same status/date fields, same audit-history
 * entries, same arrayUnion-style de-duplication on high council votes -
 * so advancing a workflow in demo mode exercises the same UI branches
 * a real one would. State lives for the life of the page.
 */
@Injectable()
export class DemoCallingsService
  implements
    Pick<
      CallingsService,
      | 'listWorkflows'
      | 'history'
      | 'create'
      | 'advanceStatus'
      | 'updateNotes'
      | 'deleteWorkflow'
      | 'rollbackStatus'
      | 'approveByHighCouncil'
      | 'withdrawHighCouncilApproval'
      | 'raiseHighCouncilConcern'
      | 'clearHighCouncilConcern'
    >
{
  private readonly workflows$ = new BehaviorSubject<CallingWorkflow[]>(demoWorkflows());
  private readonly histories = new Map<string, BehaviorSubject<CallingStatusHistoryEntry[]>>();

  constructor() {
    for (const w of this.workflows$.value) {
      this.histories.set(w.id, new BehaviorSubject(demoHistory(w)));
    }
  }

  listWorkflows(filters?: { unit?: string }): Observable<CallingWorkflow[]> {
    return this.workflows$.pipe(
      map((all) => (filters?.unit ? all.filter((w) => w.unit === filters.unit) : all)),
    );
  }

  history(workflowId: string): Observable<CallingStatusHistoryEntry[]> {
    return this.historyFor(workflowId).asObservable();
  }

  private historyFor(workflowId: string): BehaviorSubject<CallingStatusHistoryEntry[]> {
    let subject = this.histories.get(workflowId);
    if (!subject) {
      subject = new BehaviorSubject<CallingStatusHistoryEntry[]>([]);
      this.histories.set(workflowId, subject);
    }
    return subject;
  }

  async create(input: NewCallingWorkflowInput, actor: AppUser): Promise<string> {
    const id = `demo-wf-${Date.now()}`;
    const now = Timestamp.now();
    const workflow: CallingWorkflow = {
      ...input,
      id,
      status: 'proposed',
      proposedDate: now,
      hcApprovalUids: [],
      hcConcernUids: [],
      hcRequired: HC_QUORUM_REQUIRED,
      createdBy: actor.firebaseUid,
      updatedBy: actor.firebaseUid,
      createdAt: now,
      updatedAt: now,
    };

    // The real list query is ordered by createdAt desc - newest first.
    this.workflows$.next([workflow, ...this.workflows$.value]);
    this.historyFor(id).next([
      {
        id: `${id}-h0`,
        status: 'proposed',
        changedBy: actor.firebaseUid,
        changedByName: actor.displayName,
        changedAt: now,
        note: 'Workflow created.',
      },
    ]);
    return id;
  }

  async advanceStatus(
    workflow: Pick<CallingWorkflow, 'id' | 'workflowType'>,
    newStatus: string,
    actor: AppUser,
    options: AdvanceStatusOptions = {},
  ): Promise<void> {
    const now = Timestamp.now();
    const dateField = DATE_FIELD_BY_STATUS[newStatus];
    const assignedTo = newStatus === 'interview_assigned' ? options.assignedTo?.trim() : undefined;
    const setApartBy = newStatus === 'set_apart' ? options.setApartBy?.trim() : undefined;

    this.patch(workflow.id, (w) => ({
      ...w,
      status: newStatus as CallingWorkflow['status'],
      updatedBy: actor.firebaseUid,
      updatedAt: now,
      ...(dateField ? { [dateField]: now } : {}),
      ...(assignedTo ? { assignedTo } : {}),
      ...(setApartBy ? { setApartBy } : {}),
    }));

    const noteParts: string[] = [];
    if (assignedTo) noteParts.push(`Assigned to ${assignedTo}.`);
    if (setApartBy) noteParts.push(`Set apart by ${setApartBy}.`);
    if (options.note?.trim()) noteParts.push(options.note.trim());
    const note = noteParts.join(' ');

    this.appendHistory(workflow.id, {
      id: `${workflow.id}-h${Date.now()}`,
      status: newStatus,
      changedBy: actor.firebaseUid,
      changedByName: actor.displayName,
      changedAt: now,
      ...(note ? { note } : {}),
    });
  }

  async updateNotes(workflowId: string, notes: string, actor: AppUser): Promise<void> {
    this.patch(workflowId, (w) => ({
      ...w,
      notes,
      updatedBy: actor.firebaseUid,
      updatedAt: Timestamp.now(),
    }));
  }

  async deleteWorkflow(workflowId: string): Promise<void> {
    this.workflows$.next(this.workflows$.value.filter((w) => w.id !== workflowId));
  }

  async rollbackStatus(
    workflow: Pick<CallingWorkflow, 'id' | 'workflowType' | 'callingName' | 'status'>,
    actor: AppUser,
    note?: string,
  ): Promise<void> {
    const previousStatus = getPreviousStatus(
      workflow.workflowType,
      workflow.status,
      workflow.callingName,
    );
    if (!previousStatus) return;
    const now = Timestamp.now();
    const dateField = DATE_FIELD_BY_STATUS[workflow.status];

    this.patch(workflow.id, (w) => {
      const next: CallingWorkflow = {
        ...w,
        status: previousStatus as CallingWorkflow['status'],
        updatedBy: actor.firebaseUid,
        updatedAt: now,
      };
      if (dateField) delete next[dateField];
      if (workflow.status === 'interview_assigned') delete next.assignedTo;
      if (workflow.status === 'set_apart') delete next.setApartBy;
      if (workflow.status === 'complete') delete next.recordedDate;
      return next;
    });

    this.appendHistory(workflow.id, {
      id: `${workflow.id}-h${Date.now()}`,
      status: previousStatus,
      changedBy: actor.firebaseUid,
      changedByName: actor.displayName,
      changedAt: now,
      note: note?.trim()
        ? `Rolled back by the stake presidency. ${note.trim()}`
        : 'Rolled back by the stake presidency.',
    });
  }

  async approveByHighCouncil(workflowId: string, actor: AppUser): Promise<void> {
    this.recordHcPosition(workflowId, actor, 'approve', 'hc_approval',
      'High Council approval recorded.');
  }

  async withdrawHighCouncilApproval(workflowId: string, actor: AppUser): Promise<void> {
    this.recordHcPosition(workflowId, actor, 'none', 'hc_withdrawal',
      'High Council approval withdrawn.');
  }

  async raiseHighCouncilConcern(workflowId: string, actor: AppUser): Promise<void> {
    this.recordHcPosition(workflowId, actor, 'concern', 'hc_concern',
      'High Council concern raised.');
  }

  async clearHighCouncilConcern(workflowId: string, actor: AppUser): Promise<void> {
    this.recordHcPosition(workflowId, actor, 'none', 'hc_concern_cleared',
      'High Council concern cleared.');
  }

  /**
   * Mirrors the real service: a member holds at most one position, so
   * every move is "put my uid in exactly one of the two arrays, or
   * neither". The Set de-duplication stands in for arrayUnion.
   */
  private recordHcPosition(
    workflowId: string,
    actor: AppUser,
    position: 'approve' | 'concern' | 'none',
    kind: HistoryEntryKind,
    note: string,
  ): void {
    const now = Timestamp.now();
    const uid = actor.firebaseUid;
    const withUid = (list: string[] | undefined, include: boolean) => {
      const without = (list ?? []).filter((u) => u !== uid);
      return include ? [...without, uid] : without;
    };

    this.patch(workflowId, (w) => ({
      ...w,
      hcApprovalUids: withUid(w.hcApprovalUids, position === 'approve'),
      hcConcernUids: withUid(w.hcConcernUids, position === 'concern'),
      updatedBy: uid,
      updatedAt: now,
    }));

    this.appendHistory(workflowId, {
      id: `${workflowId}-h${Date.now()}`,
      status: 'presidency_approved',
      changedBy: uid,
      changedByName: actor.displayName,
      changedAt: now,
      kind,
      note,
    });
  }

  private patch(id: string, fn: (w: CallingWorkflow) => CallingWorkflow): void {
    this.workflows$.next(this.workflows$.value.map((w) => (w.id === id ? fn(w) : w)));
  }

  private appendHistory(id: string, entry: CallingStatusHistoryEntry): void {
    const subject = this.historyFor(id);
    subject.next([...subject.value, entry]);
  }
}
