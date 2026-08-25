import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { map, of, switchMap } from 'rxjs';
import { CallingsService } from '../../core/callings.service';
import { formatTimestamp, getNextStatuses } from '../../core/calling-status';
import { canAdvanceStatus, canEditNotes, isHighCouncil, isPresidency } from '../../core/roles';
import { workflowScopeLabel } from '../../core/units';
import { HC_TOTAL } from '../../core/quorum';
import { AuthService } from '../../core/auth.service';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import {
  CALLING_STATUS_LABELS,
  RELEASE_STATUS_LABELS,
  type CallingWorkflow,
} from '../../models/types';

function labelsFor(w: CallingWorkflow): Record<string, string> {
  return (w.workflowType === 'release' ? RELEASE_STATUS_LABELS : CALLING_STATUS_LABELS) as Record<
    string,
    string
  >;
}

@Component({
  selector: 'app-calling-detail',
  standalone: true,
  imports: [FormsModule, StatusBadgeComponent],
  template: `
    @if (workflow(); as w) {
      <div class="stack">
        <div class="row-between">
          <div>
            <h1 style="margin: 0">{{ w.callingName }}</h1>
            <p class="muted" style="margin: 0">{{ w.personName }} &middot; {{ workflowScopeLabel(w.unit) }}</p>
            @if (w.assignedTo) {
              <p class="text-sm" style="margin: 0.25rem 0 0">
                <span class="muted">Interview assigned to:</span> <strong>{{ w.assignedTo }}</strong>
              </p>
            }
          </div>
          <app-status-badge [status]="w.status" [label]="labelsFor(w)[w.status] ?? w.status" />
        </div>

        @if (w.status === 'presidency_approved') {
          <div class="card stack">
            <strong>High Council Approval</strong>
            <p class="text-sm" style="margin: 0">
              <strong>{{ approvalCount() }}</strong> of
              <strong>{{ w.hcRequired ?? hcTotal }}</strong> approvals
              &middot;
              @if (quorumMet()) {
                <span style="color: var(--accent)">quorum met</span>
              } @else {
                <span class="muted">quorum not yet met</span>
              }
            </p>

            @if (isHighCouncil(authService.appUser())) {
              @if (hasVoted()) {
                <p class="text-sm" style="margin: 0; color: var(--accent)">
                  ✓ You have approved this calling.
                </p>
              } @else {
                <button class="btn btn-primary" [disabled]="busy()" (click)="approveAsHc()">
                  Approve
                </button>
              }
            }
          </div>
        }

        @for (s of nextStatuses(); track s) {
          @if (canAdvance(w.status, s) && advanceButtonEnabled(w, s)) {
            <div class="card stack">
              <strong>Advance status</strong>
              @if (s === 'interview_assigned') {
                <div class="field">
                  <label>Assigned to</label>
                  <input
                    [ngModel]="pendingAssignee()"
                    (ngModelChange)="pendingAssignee.set($event)"
                    placeholder="e.g. President Poole"
                  />
                  <span class="text-sm muted">
                    Presidency member conducting the interview and extending the calling.
                  </span>
                </div>
              }
              <button
                class="btn btn-primary"
                [disabled]="busy() || (s === 'interview_assigned' && !pendingAssignee().trim())"
                (click)="advance(s)"
              >
                Mark: {{ labelsFor(w)[s] ?? s }}
              </button>
            </div>
          } @else if (!canAdvance(w.status, s)) {
            <p class="text-sm muted">
              Next step: <strong>{{ labelsFor(w)[s] ?? s }}</strong>. Only the stake presidency can
              advance from here.
            </p>
          }
        }

        @if (w.status === 'complete') {
          <p class="muted text-sm">This workflow is complete.</p>
        }

        <div class="card stack">
          <strong>Notes</strong>
          <textarea
            [ngModel]="notes()"
            (ngModelChange)="notes.set($event)"
            [disabled]="!canEditNotes(authService.appUser())"
          ></textarea>
          @if (canEditNotes(authService.appUser())) {
            <button class="btn" [disabled]="busy()" (click)="saveNotes(w.id)">Save notes</button>
          }
        </div>

        <div class="card stack">
          <strong>History</strong>
          <table>
            <tbody>
              @for (h of history(); track h.id) {
                <tr>
                  <td>{{ formatTimestamp(h.changedAt) }}</td>
                  <td>{{ labelsFor(w)[h.status] ?? h.status }}</td>
                  <td class="muted">{{ h.changedByName }}</td>
                  <td class="muted">{{ h.note ?? '' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    } @else {
      <p class="muted">Loading…</p>
    }
  `,
})
export class CallingDetailComponent {
  protected readonly authService = inject(AuthService);
  protected readonly canEditNotes = canEditNotes;
  protected readonly isHighCouncil = isHighCouncil;
  protected readonly workflowScopeLabel = workflowScopeLabel;
  protected readonly labelsFor = labelsFor;
  protected readonly formatTimestamp = formatTimestamp;
  protected readonly hcTotal = HC_TOTAL;

  private readonly route = inject(ActivatedRoute);
  private readonly callingsService = inject(CallingsService);

  private readonly id = toSignal(this.route.paramMap.pipe(map((params) => params.get('id'))), {
    initialValue: this.route.snapshot.paramMap.get('id'),
  });

  private readonly workflows = toSignal(this.callingsService.listWorkflows(), {
    initialValue: [] as CallingWorkflow[],
  });

  protected readonly workflow = computed(
    () => this.workflows().find((w) => w.id === this.id()) ?? null,
  );

  protected readonly nextStatuses = computed(() => {
    const w = this.workflow();
    if (!w) return [];
    return getNextStatuses(w.workflowType, w.status);
  });

  protected readonly approvalCount = computed(() => this.workflow()?.hcApprovalUids?.length ?? 0);

  protected readonly quorumMet = computed(() => {
    const w = this.workflow();
    if (!w) return false;
    return this.approvalCount() >= (w.hcRequired ?? Infinity);
  });

  protected readonly hasVoted = computed(() => {
    const uid = this.authService.appUser()?.firebaseUid;
    const uids = this.workflow()?.hcApprovalUids ?? [];
    return uid ? uids.includes(uid) : false;
  });

  protected readonly history = toSignal(
    toObservable(this.id).pipe(
      switchMap((id) => (id ? this.callingsService.history(id) : of([]))),
    ),
    { initialValue: [] },
  );

  // Signal, not a plain field: Angular is zoneless from v21 on, so state
  // mutated outside a template event binding (here, inside an RxJS
  // subscription) only repaints the view if it is a signal.
  protected readonly notes = signal('');
  protected readonly pendingAssignee = signal('');
  protected readonly busy = signal(false);

  constructor() {
    // Seed the notes textarea once the workflow first loads, without
    // clobbering in-progress edits on every unrelated Firestore update.
    let seeded = false;
    toObservable(this.workflow)
      .pipe(takeUntilDestroyed())
      .subscribe((w) => {
        if (w && !seeded) {
          this.notes.set(w.notes ?? '');
          seeded = true;
        }
      });
  }

  canAdvance(from: string, to: string): boolean {
    return canAdvanceStatus(this.authService.appUser(), from, to);
  }

  /**
   * HC's advance to high_council_approved is gated by quorum. Presidency
   * can bypass. All other transitions aren't gated here (the role check
   * handles them).
   */
  advanceButtonEnabled(w: CallingWorkflow, to: string): boolean {
    if (isPresidency(this.authService.appUser())) return true;
    if (w.status === 'presidency_approved' && to === 'high_council_approved') {
      return this.quorumMet();
    }
    return true;
  }

  async advance(status: string): Promise<void> {
    const actor = this.authService.appUser();
    const w = this.workflow();
    if (!actor || !w) return;
    this.busy.set(true);
    try {
      const assignedTo = status === 'interview_assigned' ? this.pendingAssignee().trim() : undefined;
      await this.callingsService.advanceStatus(w, status, actor, { assignedTo });
      this.pendingAssignee.set('');
    } finally {
      this.busy.set(false);
    }
  }

  async approveAsHc(): Promise<void> {
    const actor = this.authService.appUser();
    const w = this.workflow();
    if (!actor || !w) return;
    this.busy.set(true);
    try {
      await this.callingsService.approveByHighCouncil(w.id, actor);
    } finally {
      this.busy.set(false);
    }
  }

  async saveNotes(workflowId: string): Promise<void> {
    const actor = this.authService.appUser();
    if (!actor) return;
    this.busy.set(true);
    try {
      await this.callingsService.updateNotes(workflowId, this.notes(), actor);
    } finally {
      this.busy.set(false);
    }
  }
}
