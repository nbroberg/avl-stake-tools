import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { map, of, switchMap } from 'rxjs';
import { PriesthoodAdvancementsService } from '../../core/priesthood-advancements.service';
import { PeopleService } from '../../core/people.service';
import { formatTimestamp } from '../../core/calling-status';
import { getNextStatuses, getPreviousStatus } from '../../core/advancement-status';
import {
  canAdvanceStatus,
  canDeleteWorkflow,
  canEditNotes,
  canRollbackStatus,
  isHighCouncil,
  isPresidency,
} from '../../core/roles';
import { namesFor, tally } from '../../core/advancement-review';
import {
  personSatisfiesPriesthood,
  PRIESTHOOD_REQUIREMENT_LABELS,
  type PriesthoodRequirement,
} from '../../core/calling-authorities';
import { unitLabel, workflowScopeLabel } from '../../core/units';
import { HC_TOTAL } from '../../core/quorum';
import { AuthService } from '../../core/auth.service';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import {
  ADVANCEMENT_STATUS_LABELS,
  ADVANCEMENT_TYPE_LABELS,
  type AppUser,
  type Person,
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
                  @if (isHighCouncil(authService.appUser())) {
                    <!-- Firestore rules only let a high councilor record
                         ordained with their OWN recorded name. -->
                    <label>Ordained by</label>
                    <p class="text-sm" style="margin: 0">
                      You, {{ authService.appUser()?.displayName }}.
                    </p>
                  } @else {
                    <label>Ordained by (optional)</label>
                    @if (pendingOrdainedBy()) {
                      <p class="text-sm" style="margin: 0">
                        <strong>{{ pendingOrdainedBy() }}</strong>
                        <button
                          type="button"
                          class="btn"
                          style="margin-left: 0.5rem; padding: 0.15rem 0.6rem"
                          (click)="clearOrdainedBy()"
                        >
                          Change
                        </button>
                      </p>
                    } @else {
                      <input
                        type="search"
                        [ngModel]="ordainedByQuery()"
                        (ngModelChange)="ordainedByQuery.set($event)"
                        placeholder="Search by name…"
                        aria-label="Search for who performed the ordination"
                      />
                      @if (ordainedByQuery().trim()) {
                        @if (searchedOrdainers().length > 0) {
                          <div class="candidate-list" role="radiogroup" aria-label="Select who performed the ordination">
                            @for (p of searchedOrdainers(); track p.id) {
                              <label class="candidate">
                                <input
                                  type="radio"
                                  name="ordainedBy"
                                  [value]="p.id"
                                  (change)="pendingOrdainedBy.set(p.name)"
                                />
                                <span class="candidate-body">
                                  <span class="candidate-name">{{ p.name }}</span>
                                  <span class="candidate-meta">{{ unitLabel(p.unit) }} &middot; {{ p.priesthoodOffice }}</span>
                                </span>
                              </label>
                            }
                          </div>
                        } @else {
                          <span class="text-sm muted">No one matches "{{ ordainedByQuery().trim() }}".</span>
                        }
                      }
                      <span class="text-sm muted">
                        Requires {{ ordainerRequirementLabel() }} on record. If they aren't in the
                        stake, leave this blank and note who performed the ordination below instead.
                      </span>
                    }
                  }
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

        @if (canRollbackStatus(authService.appUser())) {
          @if (previousStatus(); as prev) {
            <div class="card stack rollback-zone">
              @if (confirmingRollback()) {
                <span class="text-sm">
                  Roll back to <strong>{{ statusLabels[prev] ?? prev }}</strong>? This undoes the
                  most recent status change - the step being undone stays visible in the history
                  below.
                </span>
                <div class="row">
                  <button class="btn btn-primary" [disabled]="busy()" (click)="rollback(w)">
                    Yes, roll back
                  </button>
                  <button class="btn" [disabled]="busy()" (click)="confirmingRollback.set(false)">
                    Cancel
                  </button>
                </div>
              } @else {
                <button
                  class="btn btn-responsive"
                  [disabled]="busy()"
                  (click)="confirmingRollback.set(true)"
                >
                  Roll back to {{ statusLabels[prev] ?? prev }}
                </button>
              }
            </div>
          }
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

        @if (canDeleteWorkflow(authService.appUser())) {
          <div class="card stack danger-zone">
            @if (confirmingDelete()) {
              <span class="text-sm">
                Permanently delete this {{ typeLabels[w.advancementType] }} record for
                {{ w.personName }}? This can't be undone; the audit history below will remain but
                the workflow itself will be gone.
              </span>
              <div class="row">
                <button class="btn btn-danger" [disabled]="busy()" (click)="deleteWorkflow(w.id)">
                  Yes, delete
                </button>
                <button class="btn" [disabled]="busy()" (click)="confirmingDelete.set(false)">
                  Cancel
                </button>
              </div>
            } @else {
              <button
                class="btn btn-danger btn-responsive"
                [disabled]="busy()"
                (click)="confirmingDelete.set(true)"
              >
                Delete this advancement
              </button>
            }
          </div>
        }
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
      .danger-zone {
        border: 1px solid var(--danger);
      }
      .rollback-zone {
        border: 1px solid var(--warn);
      }
      @media (max-width: 639.98px) {
        .history .note-empty { display: none; }
      }
      .candidate-list {
        display: flex;
        flex-direction: column;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--surface);
        max-height: 240px;
        overflow-y: auto;
      }
      .candidate {
        display: grid;
        grid-template-columns: auto 1fr;
        align-items: start;
        gap: 0.7rem;
        padding: 0.6rem 0.75rem;
        min-height: var(--tap);
        border-top: 1px solid rgba(26, 39, 51, 0.14);
        cursor: pointer;
        touch-action: manipulation;
      }
      .candidate:first-child { border-top: none; }
      @media (hover: hover) {
        .candidate:hover { background: var(--bg); }
      }
      .candidate:active { background: var(--bg); }
      .candidate input[type='radio'] { margin-top: 0.15rem; }
      .candidate-body {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        min-width: 0;
      }
      .candidate-name { font-weight: 500; color: var(--text); line-height: 1.3; }
      .candidate-meta { font-size: 0.75rem; color: var(--muted); line-height: 1.3; }
    `,
  ],
})
export class AdvancementDetailComponent {
  protected readonly authService = inject(AuthService);
  protected readonly canEditNotes = canEditNotes;
  protected readonly canDeleteWorkflow = canDeleteWorkflow;
  protected readonly canRollbackStatus = canRollbackStatus;
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
  protected readonly unitLabel = unitLabel;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly advancementsService = inject(PriesthoodAdvancementsService);
  private readonly peopleService = inject(PeopleService);

  private readonly id = toSignal(this.route.paramMap.pipe(map((params) => params.get('id'))), {
    initialValue: this.route.snapshot.paramMap.get('id'),
  });

  private readonly workflows = toSignal(this.advancementsService.listWorkflows(), {
    initialValue: [] as PriesthoodAdvancementWorkflow[],
  });

  private readonly people = toSignal(this.peopleService.list(), { initialValue: [] as Person[] });

  protected readonly workflow = computed(
    () => this.workflows().find((w) => w.id === this.id()) ?? null,
  );

  /**
   * Who's allowed to have performed this ordination - an Elder or High
   * Priest for Priest -> Elder (either already outranks a Priest), a High
   * Priest only for Elder -> High Priest. Drives both the search pool
   * below and the hint text next to it.
   */
  protected readonly ordainerRequirement = computed<PriesthoodRequirement>(() =>
    this.workflow()?.advancementType === 'priest_to_elder' ? 'melchizedek' : 'high_priest',
  );

  protected readonly ordainerRequirementLabel = computed(
    () => PRIESTHOOD_REQUIREMENT_LABELS[this.ordainerRequirement()],
  );

  private readonly eligibleOrdainers = computed(() => {
    const req = this.ordainerRequirement();
    return this.people()
      .filter((p) => personSatisfiesPriesthood(p.priesthoodOffice, req))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  protected readonly ordainedByQuery = signal('');

  /**
   * Empty until a name is typed - the eligible pool can run into the
   * hundreds stake-wide, so this is a search, not a browsable list (see
   * new-advancement.component.ts's eligiblePeople for the contrast: that
   * pool is usually small enough to browse unsearched).
   */
  protected readonly searchedOrdainers = computed(() => {
    const q = this.ordainedByQuery().trim().toLowerCase();
    if (!q) return [];
    return this.eligibleOrdainers()
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 20);
  });

  protected readonly nextStatuses = computed(() => {
    const w = this.workflow();
    return w ? getNextStatuses(w.status) : [];
  });

  protected readonly previousStatus = computed(() => {
    const w = this.workflow();
    return w ? getPreviousStatus(w.status) : null;
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
  protected readonly confirmingRollback = signal(false);
  protected readonly confirmingDelete = signal(false);

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
      // Firestore rules require a high councilor's ordainedBy to be their
      // own recorded name - enforced here too, not just in the template.
      const ordainedBy =
        status === 'ordained'
          ? isHighCouncil(actor)
            ? actor.displayName
            : this.pendingOrdainedBy().trim()
          : undefined;
      await this.advancementsService.advanceStatus(w, status, actor, { ordainedBy });
      this.pendingOrdainedBy.set('');
      this.ordainedByQuery.set('');
    } finally {
      this.busy.set(false);
    }
  }

  clearOrdainedBy(): void {
    this.pendingOrdainedBy.set('');
    this.ordainedByQuery.set('');
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

  async rollback(w: PriesthoodAdvancementWorkflow): Promise<void> {
    const actor = this.authService.appUser();
    if (!actor) return;
    this.busy.set(true);
    try {
      await this.advancementsService.rollbackStatus(w, actor);
      this.confirmingRollback.set(false);
    } finally {
      this.busy.set(false);
    }
  }

  async deleteWorkflow(workflowId: string): Promise<void> {
    this.busy.set(true);
    try {
      await this.advancementsService.deleteWorkflow(workflowId);
      await this.router.navigate(['/advancements']);
    } finally {
      this.busy.set(false);
    }
  }
}
