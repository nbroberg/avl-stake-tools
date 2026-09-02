import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map, of, switchMap } from 'rxjs';
import { CallingsService } from '../../core/callings.service';
import { formatTimestamp, getNextStatuses, getPreviousStatus } from '../../core/calling-status';
import {
  canAdvanceStatus,
  canDeleteWorkflow,
  canEditNotes,
  canRollbackStatus,
  isHighCouncil,
  isPresidency,
} from '../../core/roles';
import { namesFor, tally } from '../../core/hc-review';
import { stakeUnits, workflowScopeLabel } from '../../core/units';
import { HC_TOTAL } from '../../core/quorum';
import { AuthService } from '../../core/auth.service';
import { PeopleService } from '../../core/people.service';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import {
  ACTOR_LABELS,
  APPROVAL_LABELS,
  PRIESTHOOD_REQUIREMENT_LABELS,
  SUSTAINER_LABELS,
  advancementToClose,
  authoritiesFor,
  eligiblePeople,
  personSatisfiesPriesthood,
  priesthoodRequirementFor,
  requiresExternalApproval,
  requiresHighCouncilApproval,
} from '../../core/calling-authorities';
import {
  ADVANCEMENT_TYPE_LABELS,
  CALLING_STATUS_LABELS,
  RELEASE_STATUS_LABELS,
  type AppUser,
  type CallingWorkflow,
  type Person,
  type PriesthoodAdvancementType,
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
  imports: [FormsModule, RouterLink, StatusBadgeComponent],
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

        @if (priesthoodGap(); as gap) {
          <div class="card banner">
            <strong>Priesthood ordination needed</strong>
            <p class="text-sm" style="margin: 0.25rem 0 0">
              This calling requires <strong>{{ gap.requiredLabel }}</strong>. {{ w.personName }}
              currently
              @if (gap.actual) {
                holds the office of <strong>{{ gap.actual }}</strong>.
              } @else {
                has no priesthood office on record.
              }
              Confirm an ordination or advancement before setting apart.
            </p>
            @if (gap.suggestedAdvancement; as advType) {
              <a
                class="btn"
                style="margin-top: 0.5rem; align-self: flex-start"
                [routerLink]="['/advancements/new']"
                [queryParams]="{ type: advType, personId: w.personId }"
              >
                Start {{ ADVANCEMENT_TYPE_LABELS[advType] }} advancement
              </a>
            }
          </div>
        }

        @if (needsHcApproval() && w.status === 'presidency_approved') {
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

            <!-- Names come from the audit trail, which is the only source a
                 client may read: users/{uid} is readable only by its owner, so
                 "who hasn't voted" is deliberately not answerable here. -->
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
              <!-- The confirmation is checked FIRST: it can be armed from the
                   no-position state (Approve) or from a standing concern
                   (Approve instead), so a position branch must not shadow it. -->
              @if (confirmingApproval()) {
                <!-- Deliberate two-step: an approval is hard to unwind once the
                     workflow advances, and the button sits under a thumb. -->
                <div class="confirm stack">
                  <span class="text-sm">
                    Record your approval of {{ w.personName }} as {{ w.callingName }}?
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
                  ✓ You have approved this calling.
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

        @if (showSustainingChecklist()) {
          <div class="card stack">
            <strong>Sustaining across the stake</strong>
            <p class="text-sm" style="margin: 0">
              <strong>{{ sustainedUnitCount() }}</strong> of
              <strong>{{ stakeUnitsList.length }}</strong> units sustained
              &middot;
              @if (sustainingComplete()) {
                <span style="color: var(--accent)">all units done</span>
              } @else {
                <span class="muted">no stake conference to sustain this at, so it's ward-by-ward</span>
              }
            </p>
            @if (!sustainingComplete() && isPresidency(authService.appUser())) {
              <p class="text-sm muted" style="margin: 0">
                You may mark this sustained now anyway — doing so before every unit confirms
                will be noted in the audit trail below.
              </p>
            }
            @for (u of stakeUnitsList; track u.number) {
              <label class="row" style="gap: 0.5rem; align-items: center">
                <input
                  type="checkbox"
                  [checked]="isUnitSustained(w, u.number)"
                  [disabled]="busy() || !isPresidency(authService.appUser())"
                  (change)="toggleUnitSustained(w, u.number, $any($event.target).checked)"
                />
                {{ u.name }}
              </label>
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
                  @if (isHighCouncil(authService.appUser())) {
                    <!-- Firestore rules only let a high councilor record
                         set_apart with their OWN recorded name - they
                         can't attribute it to anyone else - so there's
                         nothing to pick here. -->
                    <label>Set apart by</label>
                    <p class="text-sm" style="margin: 0">
                      You, {{ authService.appUser()?.displayName }}.
                    </p>
                  } @else {
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
                  }
                </div>
              }
              <button
                class="btn btn-primary btn-responsive"
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

        @if (canRollbackStatus(authService.appUser())) {
          @if (previousStatus(); as prev) {
            <div class="card stack rollback-zone">
              @if (confirmingRollback()) {
                <span class="text-sm">
                  Roll back to <strong>{{ labelsFor(w)[prev] ?? prev }}</strong>? This undoes the
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
                  Roll back to {{ labelsFor(w)[prev] ?? prev }}
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
                    <td data-label="Status">{{ labelsFor(w)[h.status] ?? h.status }}</td>
                    <td data-label="By" class="muted">{{ h.changedByName }}</td>
                    <!-- Empty notes are the common case; the stacked layout drops
                         the row rather than printing a bare label. -->
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
                Permanently delete this {{ w.workflowType }} for {{ w.personName }}? This can't be
                undone; the audit history below will remain but the workflow itself will be gone.
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
                Delete this {{ w.workflowType }}
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
      /* Phones stack label over value - a max-content label column plus a name
         leaves too little room for either at 360px. */
      .authorities dl {
        display: grid;
        grid-template-columns: 1fr;
        row-gap: 0.15rem;
        margin: 0;
      }
      .authorities dt:not(:first-of-type) { margin-top: 0.5rem; }
      @media (min-width: 640px) {
        .authorities dl {
          grid-template-columns: max-content 1fr;
          column-gap: 1rem;
          row-gap: 0.35rem;
        }
        .authorities dt:not(:first-of-type) { margin-top: 0; }
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
        /* A cell with no note would otherwise render as an empty stacked row. */
        .history .note-empty { display: none; }
      }
    `,
  ],
})
export class CallingDetailComponent {
  protected readonly authService = inject(AuthService);
  protected readonly canEditNotes = canEditNotes;
  protected readonly canDeleteWorkflow = canDeleteWorkflow;
  protected readonly canRollbackStatus = canRollbackStatus;
  protected readonly isHighCouncil = isHighCouncil;
  protected readonly isPresidency = isPresidency;
  protected readonly workflowScopeLabel = workflowScopeLabel;
  protected readonly labelsFor = labelsFor;
  protected readonly formatTimestamp = formatTimestamp;
  protected readonly hcTotal = HC_TOTAL;
  protected readonly APPROVAL_LABELS = APPROVAL_LABELS;
  protected readonly SUSTAINER_LABELS = SUSTAINER_LABELS;
  protected readonly ADVANCEMENT_TYPE_LABELS = ADVANCEMENT_TYPE_LABELS;
  protected readonly stakeUnitsList = stakeUnits();

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
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

  /**
   * Releases never pass through `high_council_approved` - the release
   * ladder (RELEASE_STATUS_ORDER) skips straight from presidency approval
   * to extending the release, since the high council only weighs in on
   * who gets called, not who gets released. Gate on workflowType here
   * rather than only on the calling's approval body, or a release of an
   * HC-approved calling would wrongly show the vote card.
   */
  protected readonly needsHcApproval = computed(() => {
    const w = this.workflow();
    return !!w && w.workflowType !== 'release' && requiresHighCouncilApproval(w.callingName);
  });

  protected readonly externalApproval = computed(() => {
    const w = this.workflow();
    return !!w && requiresExternalApproval(w.callingName);
  });

  /** The person this workflow is about, resolved from the roster. Null
   *  while the roster is still loading or the person isn't imported yet
   *  (e.g. a workflow created before the roster included them). */
  protected readonly person = computed<Person | null>(() => {
    const w = this.workflow();
    if (!w) return null;
    return this.people().find((p) => p.id === w.personId) ?? null;
  });

  /**
   * Non-null when the person's current priesthood office doesn't satisfy
   * the calling's requirement — drives the ordination-needed banner.
   * Returns null when there's no restriction, when the requirement is
   * met, or when we can't resolve the person from the roster (nothing
   * to compare against). Skipped once the workflow has been set apart —
   * by then the ordination check is history.
   */
  protected readonly priesthoodGap = computed<{
    requiredLabel: string;
    actual: string;
    /** Which advancement would close this gap, when there is one to
     *  suggest - see core/calling-authorities.ts's advancementToClose(). */
    suggestedAdvancement?: PriesthoodAdvancementType;
  } | null>(() => {
    const w = this.workflow();
    const p = this.person();
    if (!w || !p) return null;
    if (w.status === 'set_apart' || w.status === 'recorded_in_lcr' || w.status === 'complete') {
      return null;
    }
    const req = priesthoodRequirementFor(w.callingName);
    if (req === 'none') return null;
    if (personSatisfiesPriesthood(p.priesthoodOffice, req)) return null;
    return {
      requiredLabel: PRIESTHOOD_REQUIREMENT_LABELS[req],
      actual: (p.priesthoodOffice ?? '').trim(),
      suggestedAdvancement: advancementToClose(p.priesthoodOffice, req),
    };
  });

  protected readonly nextStatuses = computed(() => {
    const w = this.workflow();
    if (!w) return [];
    return getNextStatuses(w.workflowType, w.status, w.callingName);
  });

  protected readonly previousStatus = computed(() => {
    const w = this.workflow();
    return w ? getPreviousStatus(w.workflowType, w.status, w.callingName) : null;
  });

  /**
   * A stake-level workflow (no `unit`) one step away from `sustained`
   * needs a sustaining vote in every ward/branch before it can advance -
   * there's no stake conference to sustain it at instead. Ward/branch
   * workflows already carry their one unit and don't need the checklist.
   */
  protected readonly showSustainingChecklist = computed(() => {
    const w = this.workflow();
    return !!w && !w.unit && this.nextStatuses().includes('sustained');
  });

  protected readonly sustainedUnitCount = computed(
    () => this.workflow()?.sustainedInUnits?.length ?? 0,
  );

  protected readonly sustainingComplete = computed(() => {
    const w = this.workflow();
    if (!w) return false;
    const done = new Set(w.sustainedInUnits ?? []);
    return this.stakeUnitsList.every((u) => done.has(u.number));
  });

  /** People eligible to extend the calling and/or set the person apart —
   *  same list for both actions per Handbook 30.8. */
  protected readonly eligibleExtenders = computed(() => {
    const a = this.authorities();
    if (!a) return [];
    return eligiblePeople(a.callSetApart, this.people());
  });

  /** Approval/concern counts and whether the council may advance itself. */
  protected readonly hc = computed(() => {
    const w = this.workflow();
    return w
      ? tally(w)
      : { approved: 0, required: 0, concerns: 0, quorumMet: false, clearToAdvance: false };
  });

  /** Where the signed-in member currently stands on this workflow. */
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
  protected readonly confirmingApproval = signal(false);
  protected readonly confirmingRollback = signal(false);
  protected readonly confirmingDelete = signal(false);

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
   * HC's advance to high_council_approved needs quorum AND no concern
   * still outstanding - the same condition firestore.rules enforces. A
   * stake-wide workflow's advance to `sustained` needs every unit
   * checked off. Presidency can bypass both - on the record, see the
   * note advance() attaches when it does. All other transitions aren't
   * gated here (the role check handles them).
   */
  advanceButtonEnabled(w: CallingWorkflow, to: string): boolean {
    if (to === 'sustained' && !w.unit) {
      return this.sustainingComplete() || isPresidency(this.authService.appUser());
    }
    if (isPresidency(this.authService.appUser())) return true;
    if (w.status === 'presidency_approved' && to === 'high_council_approved') {
      return this.hc().clearToAdvance;
    }
    return true;
  }

  isUnitSustained(w: CallingWorkflow, unitNumber: string): boolean {
    return (w.sustainedInUnits ?? []).includes(unitNumber);
  }

  async toggleUnitSustained(w: CallingWorkflow, unitNumber: string, checked: boolean): Promise<void> {
    const actor = this.authService.appUser();
    if (!actor) return;
    this.busy.set(true);
    try {
      if (checked) {
        await this.callingsService.markUnitSustained(w, unitNumber, actor);
      } else {
        await this.callingsService.unmarkUnitSustained(w.id, unitNumber, actor);
      }
    } finally {
      this.busy.set(false);
    }
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
      // Firestore rules require a high councilor's setApartBy to be their
      // own recorded name - enforced here too, not just hidden in the
      // template, so this can't drift out of sync with firestore.rules.
      const setApartBy =
        status === 'set_apart'
          ? isHighCouncil(actor)
            ? actor.displayName
            : this.pendingSetApartBy().trim()
          : undefined;
      // Presidency bypassing the "every unit" sustaining checklist - flag
      // it plainly in the audit trail rather than letting it read like an
      // ordinary sustaining.
      const note =
        status === 'sustained' && !w.unit && !this.sustainingComplete()
          ? `Sustained by the stake presidency; only ${this.sustainedUnitCount()} of ` +
            `${this.stakeUnitsList.length} units had confirmed.`
          : undefined;
      await this.callingsService.advanceStatus(w, status, actor, { assignedTo, setApartBy, note });
      this.pendingAssignee.set('');
      this.pendingSetApartBy.set('');
    } finally {
      this.busy.set(false);
    }
  }

  /** Arm the confirmation step rather than voting on the first tap. */
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
    run: (service: CallingsService, workflowId: string, actor: AppUser) => Promise<void>,
  ): Promise<void> {
    const actor = this.authService.appUser();
    const w = this.workflow();
    if (!actor || !w) return;
    this.busy.set(true);
    try {
      await run(this.callingsService, w.id, actor);
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
      await this.callingsService.updateNotes(workflowId, this.notes(), actor);
    } finally {
      this.busy.set(false);
    }
  }

  async rollback(w: CallingWorkflow): Promise<void> {
    const actor = this.authService.appUser();
    if (!actor) return;
    this.busy.set(true);
    try {
      await this.callingsService.rollbackStatus(w, actor);
      this.confirmingRollback.set(false);
    } finally {
      this.busy.set(false);
    }
  }

  async deleteWorkflow(workflowId: string): Promise<void> {
    this.busy.set(true);
    try {
      await this.callingsService.deleteWorkflow(workflowId);
      await this.router.navigate(['/callings']);
    } finally {
      this.busy.set(false);
    }
  }
}
