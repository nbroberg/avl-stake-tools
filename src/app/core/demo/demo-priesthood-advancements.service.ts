import { Injectable } from '@angular/core';
import { Timestamp } from 'firebase/firestore';
import { BehaviorSubject, Observable, map } from 'rxjs';
import type {
  AdvanceAdvancementStatusOptions,
  NewAdvancementWorkflowInput,
  PriesthoodAdvancementsService,
} from '../priesthood-advancements.service';
import { DATE_FIELD_BY_ADVANCEMENT_STATUS, getPreviousStatus } from '../advancement-status';
import { HC_QUORUM_REQUIRED } from '../quorum';
import type {
  AdvancementHistoryEntry,
  AppUser,
  HistoryEntryKind,
  PriesthoodAdvancementWorkflow,
} from '../../models/types';
import { demoAdvancementHistory, demoAdvancementWorkflows } from './demo-data';

/**
 * In-memory stand-in for PriesthoodAdvancementsService - same pattern as
 * DemoCallingsService: identical status/date fields, identical audit
 * history entries, identical arrayUnion-style de-duplication on high
 * council votes.
 */
@Injectable()
export class DemoPriesthoodAdvancementsService
  implements
    Pick<
      PriesthoodAdvancementsService,
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
  private readonly workflows$ = new BehaviorSubject<PriesthoodAdvancementWorkflow[]>(
    demoAdvancementWorkflows(),
  );
  private readonly histories = new Map<string, BehaviorSubject<AdvancementHistoryEntry[]>>();

  constructor() {
    for (const w of this.workflows$.value) {
      this.histories.set(w.id, new BehaviorSubject(demoAdvancementHistory(w)));
    }
  }

  listWorkflows(filters?: { unit?: string }): Observable<PriesthoodAdvancementWorkflow[]> {
    return this.workflows$.pipe(
      map((all) => (filters?.unit ? all.filter((w) => w.unit === filters.unit) : all)),
    );
  }

  history(workflowId: string): Observable<AdvancementHistoryEntry[]> {
    return this.historyFor(workflowId).asObservable();
  }

  private historyFor(workflowId: string): BehaviorSubject<AdvancementHistoryEntry[]> {
    let subject = this.histories.get(workflowId);
    if (!subject) {
      subject = new BehaviorSubject<AdvancementHistoryEntry[]>([]);
      this.histories.set(workflowId, subject);
    }
    return subject;
  }

  async create(input: NewAdvancementWorkflowInput, actor: AppUser): Promise<string> {
    const id = `demo-adv-${Date.now()}`;
    const now = Timestamp.now();
    const workflow: PriesthoodAdvancementWorkflow = {
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
    workflow: Pick<PriesthoodAdvancementWorkflow, 'id'>,
    newStatus: string,
    actor: AppUser,
    options: AdvanceAdvancementStatusOptions = {},
  ): Promise<void> {
    const now = Timestamp.now();
    const dateField = DATE_FIELD_BY_ADVANCEMENT_STATUS[newStatus];
    const ordainedBy = newStatus === 'ordained' ? options.ordainedBy?.trim() : undefined;

    this.patch(workflow.id, (w) => ({
      ...w,
      status: newStatus as PriesthoodAdvancementWorkflow['status'],
      updatedBy: actor.firebaseUid,
      updatedAt: now,
      ...(dateField ? { [dateField]: now } : {}),
      ...(ordainedBy ? { ordainedBy } : {}),
    }));

    const noteParts: string[] = [];
    if (ordainedBy) noteParts.push(`Ordained by ${ordainedBy}.`);
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
    workflow: Pick<PriesthoodAdvancementWorkflow, 'id' | 'status'>,
    actor: AppUser,
    note?: string,
  ): Promise<void> {
    const previousStatus = getPreviousStatus(workflow.status);
    if (!previousStatus) return;
    const now = Timestamp.now();
    const dateField = DATE_FIELD_BY_ADVANCEMENT_STATUS[workflow.status];

    this.patch(workflow.id, (w) => {
      const next: PriesthoodAdvancementWorkflow = {
        ...w,
        status: previousStatus as PriesthoodAdvancementWorkflow['status'],
        updatedBy: actor.firebaseUid,
        updatedAt: now,
      };
      if (dateField) delete next[dateField];
      if (workflow.status === 'ordained') delete next.ordainedBy;
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

  private patch(
    id: string,
    fn: (w: PriesthoodAdvancementWorkflow) => PriesthoodAdvancementWorkflow,
  ): void {
    this.workflows$.next(this.workflows$.value.map((w) => (w.id === id ? fn(w) : w)));
  }

  private appendHistory(id: string, entry: AdvancementHistoryEntry): void {
    const subject = this.historyFor(id);
    subject.next([...subject.value, entry]);
  }
}
