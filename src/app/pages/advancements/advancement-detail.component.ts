import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { map, of, switchMap } from 'rxjs';
import { PriesthoodAdvancementsService } from '../../core/priesthood-advancements.service';
import { formatTimestamp } from '../../core/calling-status';
import { getNextStatuses } from '../../core/advancement-status';
import { canAdvanceStatus, canEditNotes, isHighCouncil, isPresidency } from '../../core/roles';
import { namesFor, tally } from '../../core/advancement-review';
import { workflowScopeLabel } from '../../core/units';
import { HC_TOTAL } from '../../core/quorum';
import { AuthService } from '../../core/auth.service';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import {
  ADVANCEMENT_STATUS_LABELS,
  ADVANCEMENT_TYPE_LABELS,
  type AppUser,
  type PriesthoodAdvancementWorkflow,
} from '../../models/types';

@Component({
  selector: 'app-advancement-detail',
  standalone: true,
  imports: [FormsModule, StatusBadgeComponent],
  template: `
    @if (workflow(); as w) {
      <div class="stack">
        <div class="row-between">
          <div>
            <h1 style="margin: 0">{{ typeLabels[w.advancementType] }}</h1>
            <p class="muted" style="margin: 0">{{ w.personName }} &middot; {{ workflowScopeLabel(w.unit) }}</p>
            @if (w.ordainedBy) {
              <p class="text-sm" style="margin: 0.25rem 0 0">
                <span class="muted">Ordained by:</span> <strong>{{ w.ordainedBy }}</strong>
              </p>
            }
          </div>
          <app-status-badge [status]="w.status" [label]="statusLabels[w.status] ?? w.status" />
        </div>

        @if (w.status === 'presidency_approved') {
          <div class="card stack">
            <strong>High Council Approval</strong>
            <p class="text-sm" style="margin: 0">
              <strong>{{ hc().approved }}</strong> of
              <strong>{{ w.hcRequired ?? hcTotal }}</strong> approvals
              &middot;
              @if (hc().quorumMet) {
                <span style="color: var(--accent)">quorum met</span>
              } @else {
                <span class="muted">quorum not yet met</span>
              }
            </p>

            @if (hc().concerns > 0) {
              <div class="concern-note text-sm">
                <strong>
                  {{ hc().concerns }}
                  {{ hc().concerns === 1 ? 'concern' : 'concerns' }} raised.
                </strong>
                A concern isn't a veto, but the high council can't advance past one
                on its own — talk it through and have it cleared, or the stake
                presidency can advance deliberately.
              </div>
            }

            @if (isPresidency(authService.appUser())) {
              <div class="text-sm roster-line">
                <span class="muted">Approved by:</span>
                {{ approverNames().names.length > 0 ? approverNames().names.join(', ') : '—' }}
                @if (approverNames().unnamed > 0) {
                  <span class="muted">(+{{ approverNames().unnamed }} not named in the trail)</span>
                }
              </div>
              @if (hc().concerns > 0) {
                <div class="text-sm roster-line">
                  <span class="muted">Concern from:</span>
                  {{ concernNames().names.length > 0 ? concernNames().names.join(', ') : '—' }}
                </div>
              }
            }

            @if (isHighCouncil(authService.appUser())) {
              @if (confirmingApproval()) {
                <div class="confirm stack">
                  <span class="text-sm">
                    Record your approval of {{ w.personName }} for {{ typeLabels[w.advancementType] }}?
                  </span>
                  <div class="row">
                    <button class="btn btn-primary" [disabled]="busy()" (click)="approveAsHc()">
                      Yes, approve
                    </button>
                    <button class="btn" [disabled]="busy()" (click)="confirmingApproval.set(false)">
                      Cancel
                    </button>
                  </div>
                </div>
              } @else if (myPosition() === 'approved') {
                <p class="text-sm" style="margin: 0; color: var(--accent)">
                  ✓ You have approved this advancement.
                </p>
                <button class="btn btn-responsive" [disabled]="busy()" (click)="withdrawAsHc()">
                  Withdraw my approval
                </button>
              } @else if (myPosition() === 'concern') {
                <p class="text-sm" style="margin: 0; color: var(--warn)">
                  ⚠ You have registered a concern.
                </p>
                <div class="row">
                  <button class="btn btn-primary" [disabled]="busy()" (click)="startApprove()">
                    Approve instead
                  </button>
                  <button class="btn" [disabled]="busy()" (click)="clearConcernAsHc()">
                    Clear my concern
                  </button>
                </div>
              } @else {
                <div class="row">
                  <button class="btn btn-primary" [disabled]="busy()" (click)="startApprove()">
                    Approve
                  </button>
                  <button class="btn" [disabled]="busy()" (click)="raiseConcernAsHc()">
                    Raise a concern
                  </button>
                </div>
              }
            }
          </div>
        }

        @for (s of nextStatuses(); track s) {
          @if (canAdvance(w.status, s)) {
            <div class="card stack">
              <strong>Advance status</strong>
              @if (s === 'ordained') {
                <div class="field">
                  <label>Ordained by (optional)</label>
                  <input
                    [ngModel]="pendingOrdainedBy()"
                    (ngModelChange)="pendingOrdainedBy.set($event)"
                    placeholder="e.g. President Whitfield"
                  />
                </div>
              }
              <button
                class="btn btn-primary btn-responsive"
                [disabled]="busy() || !advanceButtonEnabled(w, s)"
                (click)="advance(s)"
              >
                Mark: {{ statusLabels[s] ?? s }}
              </button>
              @if (!advanceButtonEnabled(w, s)) {
                <p class="text-sm muted" style="margin: 0">
                  Waiting on high council quorum with no outstanding concern.
                </p>
              }
            </div>
          } @else {
            <p class="text-sm muted">
              Next step: <strong>{{ statusLabels[s] ?? s }}</strong>. Only the stake presidency can
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
            <button class="btn btn-responsive" [disabled]="busy()" (click)="saveNotes(w.id)">
              Save notes
            </button>
          }
        </div>

        <div class="card stack">
          <strong>History</strong>
          <div class="table-wrap">
            <table class="stacked history">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Status</th>
                  <th>By</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                @for (h of history(); track h.id) {
                  <tr>
                    <td data-label="When">{{ formatTimestamp(h.changedAt) }}</td>
                    <td data-label="Status">{{ statusLabels[h.status] ?? h.status }}</td>
                    <td data-label="By" class="muted">{{ h.changedByName }}</td>
                    @if (h.note) {
                      <td data-label="Note" class="muted">{{ h.note }}</td>
                    } @else {
                      <td class="note-empty muted"></td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    } @else {
      <p class="muted">Loading…</p>
    }
  `,
  styles: [
    `
      .concern-note {
        padding: 0.6rem 0.75rem;
        border-radius: 8px;
        border-left: 3px solid var(--warn);
        background: var(--bg);
      }
      .confirm {
        padding: 0.75rem;
        border-radius: 8px;
        border: 1px solid var(--primary);
        background: var(--bg);
        gap: 0.6rem;
      }
      .roster-line { line-height: 1.45; }
      @media (max-width: 639.98px) {
        .history .note-empty { display: none; }
      }
    `,
  ],
})
export class AdvancementDetailComponent {
  protected readonly authService = inject(AuthService);
  protected readonly canEditNotes = canEditNotes;
  protected readonly isHighCouncil = isHighCouncil;
  protected readonly isPresidency = isPresidency;
  protected readonly workflowScopeLabel = workflowScopeLabel;
  // Cast to a string-indexed record: the template indexes it with plain
  // strings (workflow status, history entry status) rather than the
  // narrower AdvancementStatus union.
  protected readonly statusLabels = ADVANCEMENT_STATUS_LABELS as Record<string, string>;
  protected readonly typeLabels = ADVANCEMENT_TYPE_LABELS;
  protected readonly formatTimestamp = formatTimestamp;
  protected readonly hcTotal = HC_TOTAL;

  private readonly route = inject(ActivatedRoute);
  private readonly advancementsService = inject(PriesthoodAdvancementsService);

  private readonly id = toSignal(this.route.paramMap.pipe(map((params) => params.get('id'))), {
    initialValue: this.route.snapshot.paramMap.get('id'),
  });

  private readonly workflows = toSignal(this.advancementsService.listWorkflows(), {
    initialValue: [] as PriesthoodAdvancementWorkflow[],
  });

  protected readonly workflow = computed(
    () => this.workflows().find((w) => w.id === this.id()) ?? null,
  );

  protected readonly nextStatuses = computed(() => {
    const w = this.workflow();
    return w ? getNextStatuses(w.status) : [];
  });

  protected readonly hc = computed(() => {
    const w = this.workflow();
    return w
      ? tally(w)
      : { approved: 0, required: 0, concerns: 0, quorumMet: false, clearToAdvance: false };
  });

  protected readonly myPosition = computed<'approved' | 'concern' | 'none'>(() => {
    const uid = this.authService.appUser()?.firebaseUid;
    const w = this.workflow();
    if (!uid || !w) return 'none';
    if ((w.hcApprovalUids ?? []).includes(uid)) return 'approved';
    if ((w.hcConcernUids ?? []).includes(uid)) return 'concern';
    return 'none';
  });

  protected readonly approverNames = computed(() =>
    namesFor(this.workflow()?.hcApprovalUids ?? [], this.history()),
  );

  protected readonly concernNames = computed(() =>
    namesFor(this.workflow()?.hcConcernUids ?? [], this.history()),
  );

  protected readonly history = toSignal(
    toObservable(this.id).pipe(
      switchMap((id) => (id ? this.advancementsService.history(id) : of([]))),
    ),
    { initialValue: [] },
  );

  protected readonly notes = signal('');
  protected readonly pendingOrdainedBy = signal('');
  protected readonly busy = signal(false);
  protected readonly confirmingApproval = signal(false);

  constructor() {
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
   * HC's advance to high_council_approved needs quorum AND no concern
   * still outstanding - the same condition firestore.rules enforces.
   * Presidency can bypass both. All other transitions aren't gated here.
   */
  advanceButtonEnabled(w: PriesthoodAdvancementWorkflow, to: string): boolean {
    if (isPresidency(this.authService.appUser())) return true;
    if (w.status === 'presidency_approved' && to === 'high_council_approved') {
      return this.hc().clearToAdvance;
    }
    return true;
  }

  async advance(status: string): Promise<void> {
    const actor = this.authService.appUser();
    const w = this.workflow();
    if (!actor || !w) return;
    this.busy.set(true);
    try {
      const ordainedBy = status === 'ordained' ? this.pendingOrdainedBy().trim() : undefined;
      await this.advancementsService.advanceStatus(w, status, actor, { ordainedBy });
      this.pendingOrdainedBy.set('');
    } finally {
      this.busy.set(false);
    }
  }

  startApprove(): void {
    this.confirmingApproval.set(true);
  }

  async approveAsHc(): Promise<void> {
    await this.hcAction((service, id, actor) => service.approveByHighCouncil(id, actor));
  }

  async withdrawAsHc(): Promise<void> {
    await this.hcAction((service, id, actor) => service.withdrawHighCouncilApproval(id, actor));
  }

  async raiseConcernAsHc(): Promise<void> {
    await this.hcAction((service, id, actor) => service.raiseHighCouncilConcern(id, actor));
  }

  async clearConcernAsHc(): Promise<void> {
    await this.hcAction((service, id, actor) => service.clearHighCouncilConcern(id, actor));
  }

  private async hcAction(
    run: (
      service: PriesthoodAdvancementsService,
      workflowId: string,
      actor: AppUser,
    ) => Promise<void>,
  ): Promise<void> {
    const actor = this.authService.appUser();
    const w = this.workflow();
    if (!actor || !w) return;
    this.busy.set(true);
    try {
      await run(this.advancementsService, w.id, actor);
      this.confirmingApproval.set(false);
    } finally {
      this.busy.set(false);
    }
  }

  async saveNotes(workflowId: string): Promise<void> {
    const actor = this.authService.appUser();
    if (!actor) return;
    this.busy.set(true);
    try {
      await this.advancementsService.updateNotes(workflowId, this.notes(), actor);
    } finally {
      this.busy.set(false);
    }
  }
}
