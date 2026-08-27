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
import { PeopleService } from '../../core/people.service';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import {
  ACTOR_LABELS,
  APPROVAL_LABELS,
  SUSTAINER_LABELS,
  authoritiesFor,
  eligiblePeople,
  requiresExternalApproval,
  requiresHighCouncilApproval,
} from '../../core/calling-authorities';
import {
  CALLING_STATUS_LABELS,
  RELEASE_STATUS_LABELS,
  type CallingWorkflow,
  type Person,
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
            @if (w.setApartBy) {
              <p class="text-sm" style="margin: 0.25rem 0 0">
                <span class="muted">Set apart by:</span> <strong>{{ w.setApartBy }}</strong>
              </p>
            }
          </div>
          <app-status-badge [status]="w.status" [label]="labelsFor(w)[w.status] ?? w.status" />
        </div>

        @if (authorities(); as a) {
          <div class="card stack authorities">
            <strong>Authorities (Handbook 30.8)</strong>
            <dl>
              <dt>Recommended by</dt>
              <dd>{{ actorList(a.recommend) }}</dd>
              <dt>Approved by</dt>
              <dd>{{ APPROVAL_LABELS[a.approve] }}</dd>
              <dt>Sustained by</dt>
              <dd>{{ SUSTAINER_LABELS[a.sustain] }}</dd>
              <dt>Called &amp; set apart by</dt>
              <dd>{{ actorList(a.callSetApart) }}</dd>
            </dl>
            @if (a.notes) {
              <p class="text-sm muted" style="margin: 0">{{ a.notes }}</p>
            }
          </div>
        }

        @if (externalApproval()) {
          <div class="card banner">
            <strong>External approval required</strong>
            <p class="text-sm" style="margin: 0.25rem 0 0">
              This calling is approved by {{ APPROVAL_LABELS[authorities()!.approve] }} —
              secure that approval through LCR before advancing the workflow beyond
              Stake Presidency Approved.
            </p>
          </div>
        }

        @if (needsHcApproval() && w.status === 'presidency_approved') {
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
                  @if (eligibleExtenders().length > 0) {
                    <select
                      [ngModel]="pendingAssignee()"
                      (ngModelChange)="pendingAssignee.set($event)"
                    >
                      <option value="" disabled>Select a person…</option>
                      @for (p of eligibleExtenders(); track p.id) {
                        <option [value]="p.name">
                          {{ p.name }} — {{ eligibilityLabel(p) }}
                        </option>
                      }
                    </select>
                  } @else {
                    <p class="text-sm muted" style="margin: 0">
                      No one in the roster currently holds a calling that would authorize them
                      to extend this. Import the roster from LCR, or use a name here:
                    </p>
                    <input
                      [ngModel]="pendingAssignee()"
                      (ngModelChange)="pendingAssignee.set($event)"
                      placeholder="e.g. President Poole"
                    />
                  }
                  <span class="text-sm muted">
                    Restricted to: {{ actorList(authorities()?.callSetApart ?? []) }}.
                  </span>
                </div>
              }
              @if (s === 'set_apart') {
                <div class="field">
                  <label>Set apart by (optional)</label>
                  @if (eligibleExtenders().length > 0) {
                    <select
                      [ngModel]="pendingSetApartBy()"
                      (ngModelChange)="pendingSetApartBy.set($event)"
                    >
                      <option value="">— unspecified —</option>
                      @for (p of eligibleExtenders(); track p.id) {
                        <option [value]="p.name">
                          {{ p.name }} — {{ eligibilityLabel(p) }}
                        </option>
                      }
                    </select>
                  } @else {
                    <input
                      [ngModel]="pendingSetApartBy()"
                      (ngModelChange)="pendingSetApartBy.set($event)"
                      placeholder="Name (optional)"
                    />
                  }
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
  styles: [
    `
      .authorities dl {
        display: grid;
        grid-template-columns: max-content 1fr;
        column-gap: 1rem;
        row-gap: 0.35rem;
        margin: 0;
      }
      .authorities dt {
        font-size: 0.72rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--muted);
      }
      .authorities dd { margin: 0; }
      .banner {
        border-left: 3px solid var(--warn);
        background: var(--bg);
      }
    `,
  ],
})
export class CallingDetailComponent {
  protected readonly authService = inject(AuthService);
  protected readonly canEditNotes = canEditNotes;
  protected readonly isHighCouncil = isHighCouncil;
  protected readonly workflowScopeLabel = workflowScopeLabel;
  protected readonly labelsFor = labelsFor;
  protected readonly formatTimestamp = formatTimestamp;
  protected readonly hcTotal = HC_TOTAL;
  protected readonly APPROVAL_LABELS = APPROVAL_LABELS;
  protected readonly SUSTAINER_LABELS = SUSTAINER_LABELS;

  private readonly route = inject(ActivatedRoute);
  private readonly callingsService = inject(CallingsService);
  private readonly peopleService = inject(PeopleService);

  private readonly id = toSignal(this.route.paramMap.pipe(map((params) => params.get('id'))), {
    initialValue: this.route.snapshot.paramMap.get('id'),
  });

  private readonly workflows = toSignal(this.callingsService.listWorkflows(), {
    initialValue: [] as CallingWorkflow[],
  });

  private readonly people = toSignal(this.peopleService.list(), {
    initialValue: [] as Person[],
  });

  protected readonly workflow = computed(
    () => this.workflows().find((w) => w.id === this.id()) ?? null,
  );

  protected readonly authorities = computed(() => {
    const w = this.workflow();
    return w ? authoritiesFor(w.callingName) : null;
  });

  protected readonly needsHcApproval = computed(() => {
    const w = this.workflow();
    return !!w && requiresHighCouncilApproval(w.callingName);
  });

  protected readonly externalApproval = computed(() => {
    const w = this.workflow();
    return !!w && requiresExternalApproval(w.callingName);
  });

  protected readonly nextStatuses = computed(() => {
    const w = this.workflow();
    if (!w) return [];
    return getNextStatuses(w.workflowType, w.status, w.callingName);
  });

  /** People eligible to extend the calling and/or set the person apart —
   *  same list for both actions per Handbook 30.8. */
  protected readonly eligibleExtenders = computed(() => {
    const a = this.authorities();
    if (!a) return [];
    return eligiblePeople(a.callSetApart, this.people());
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
  protected readonly pendingSetApartBy = signal('');
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

  /** Render an actor-role list as a human-readable sentence. */
  actorList(actors: readonly import('../../core/calling-authorities').Actor[]): string {
    if (actors.length === 0) return '—';
    return actors.map((a) => ACTOR_LABELS[a]).join(' · ');
  }

  /** The person's most workflow-relevant calling, shown after their name
   *  in the eligibility dropdown so a reader can tell which authority
   *  qualifies them. Prefers presidency > high council > bishop > branch
   *  > EQ president; falls back to the first Stake-prefixed calling. */
  eligibilityLabel(p: Person): string {
    const callings = p.callings ?? [];
    const priority = [
      'Stake President',
      'Stake Presidency First Counselor',
      'Stake Presidency Second Counselor',
      'Stake High Councilor',
      'Bishop',
      'Branch President',
      'Elders Quorum President',
    ];
    for (const r of priority) if (callings.includes(r)) return r;
    return callings.find((c) => c.startsWith('Stake ')) ?? callings[0] ?? '';
  }

  async advance(status: string): Promise<void> {
    const actor = this.authService.appUser();
    const w = this.workflow();
    if (!actor || !w) return;
    this.busy.set(true);
    try {
      const assignedTo = status === 'interview_assigned' ? this.pendingAssignee().trim() : undefined;
      const setApartBy = status === 'set_apart' ? this.pendingSetApartBy().trim() : undefined;
      await this.callingsService.advanceStatus(w, status, actor, { assignedTo, setApartBy });
      this.pendingAssignee.set('');
      this.pendingSetApartBy.set('');
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
