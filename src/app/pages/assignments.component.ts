import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { combineLatest, map, of, switchMap } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { CallingsService } from '../core/callings.service';
import { PriesthoodAdvancementsService } from '../core/priesthood-advancements.service';
import {
  advancementAwaitsResponseFrom,
  callingAwaitsResponseFrom,
  isAdvancementOpenForHcVote,
  isCallingOpenForHcVote,
  namesFor,
  tally,
  type HcTally,
} from '../core/hc-vote';
import { isPresidency } from '../core/roles';
import { workflowScopeLabel } from '../core/units';
import { formatTimestamp } from '../core/calling-status';
import {
  ADVANCEMENT_TYPE_LABELS,
  type CallingWorkflow,
  type PriesthoodAdvancementWorkflow,
} from '../models/types';

/** Distinguishes a calling extension from a release from a priesthood
 * advancement - the axis the top-of-page toggle filters on. */
type RowType = 'calling' | 'release' | 'advancement';

interface PersonalRow {
  id: string;
  type: RowType;
  title: string;
  subtitle: string;
  link: string[];
}

interface OutstandingVoteRow extends PersonalRow {
  tally: HcTally;
  approverNames: { names: string[]; unnamed: number };
  concernNames: { names: string[]; unnamed: number };
}

interface InterviewAssignmentRow extends PersonalRow {
  assignedTo: string | null;
}

interface ProposedRow extends PersonalRow {
  proposedDate: string;
}

/** The one status at which a calling has a live interview assignment. */
const INTERVIEW_ASSIGNED_STATUS = 'interview_assigned';

/** The status a workflow starts at, before the presidency's own first review. */
const PROPOSED_STATUS = 'proposed';

const TYPE_LABELS: Record<RowType, string> = {
  calling: 'Calling',
  release: 'Release',
  advancement: 'Advancement',
};

@Component({
  selector: 'app-assignments',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="stack">
      <h1 style="margin-bottom: 0">Assignments</h1>

      <div class="row" role="group" aria-label="Filter by type">
        <button
          type="button"
          class="btn btn-sm"
          [class.btn-primary]="typeFilter() === 'all'"
          (click)="typeFilter.set('all')"
        >
          All
        </button>
        <button
          type="button"
          class="btn btn-sm"
          [class.btn-primary]="typeFilter() === 'calling'"
          (click)="typeFilter.set('calling')"
        >
          Callings
        </button>
        <button
          type="button"
          class="btn btn-sm"
          [class.btn-primary]="typeFilter() === 'release'"
          (click)="typeFilter.set('release')"
        >
          Releases
        </button>
      </div>

      <div class="stack">
        <strong>Your assignments</strong>
        @if (myVotes().length === 0 && myInterviews().length === 0) {
          <p class="muted">Nothing is currently assigned to you.</p>
        } @else {
          @if (myVotes().length > 0) {
            <div class="stack">
              <span class="text-sm muted">High Council votes</span>
              @for (row of myVotes(); track row.id) {
                <a class="list-item type-{{ row.type }}" [routerLink]="row.link">
                  <strong>{{ row.title }}</strong>
                  <span class="type-tag type-tag-{{ row.type }}">{{ typeLabel(row.type) }}</span>
                  <div class="muted text-sm">{{ row.subtitle }}</div>
                </a>
              }
            </div>
          }
          @if (myInterviews().length > 0) {
            <div class="stack">
              <span class="text-sm muted">Interviews to conduct</span>
              @for (row of myInterviews(); track row.id) {
                <a class="list-item type-{{ row.type }}" [routerLink]="row.link">
                  <strong>{{ row.title }}</strong>
                  <span class="type-tag type-tag-{{ row.type }}">{{ typeLabel(row.type) }}</span>
                  <div class="muted text-sm">{{ row.subtitle }}</div>
                </a>
              }
            </div>
          }
        }
      </div>

      @if (isPresidency(authService.appUser())) {
        <div class="stack">
          <strong>Outstanding across the stake</strong>

          <div class="stack">
            <span class="text-sm muted">Proposed, awaiting your review</span>
            @if (allProposed().length === 0) {
              <p class="muted">Nothing is currently proposed.</p>
            } @else {
              @for (row of allProposed(); track row.id) {
                <div class="card row-between type-{{ row.type }}">
                  <div>
                    <strong>{{ row.title }}</strong>
                    <span class="type-tag type-tag-{{ row.type }}">{{ typeLabel(row.type) }}</span>
                    <p class="muted text-sm" style="margin: 0">{{ row.subtitle }}</p>
                  </div>
                  <div style="text-align: right">
                    <p class="muted text-sm" style="margin: 0 0 0.4rem">Proposed {{ row.proposedDate }}</p>
                    <a class="btn btn-responsive" [routerLink]="row.link">Review</a>
                  </div>
                </div>
              }
            }
          </div>

          <div class="stack">
            <span class="text-sm muted">High Council votes</span>
            @if (outstandingVotes().length === 0) {
              <p class="muted">Nothing is currently awaiting a High Council vote.</p>
            } @else {
              @for (row of outstandingVotes(); track row.id) {
                <div class="card stack type-{{ row.type }}">
                  <div class="row-between">
                    <div>
                      <strong>{{ row.title }}</strong>
                      <span class="type-tag type-tag-{{ row.type }}">{{ typeLabel(row.type) }}</span>
                      <p class="muted text-sm" style="margin: 0">{{ row.subtitle }}</p>
                    </div>
                    <a class="btn btn-responsive" [routerLink]="row.link">View</a>
                  </div>
                  <p class="text-sm" style="margin: 0">
                    <strong>{{ row.tally.approved }}</strong> of
                    <strong>{{ row.tally.required }}</strong> approvals
                    &middot;
                    @if (row.tally.quorumMet) {
                      <span style="color: var(--accent)">quorum met</span>
                    } @else {
                      <span class="muted">quorum not yet met</span>
                    }
                  </p>
                  @if (row.tally.concerns > 0) {
                    <p class="text-sm" style="margin: 0; color: var(--warn)">
                      {{ row.tally.concerns }}
                      {{ row.tally.concerns === 1 ? 'concern' : 'concerns' }} raised
                    </p>
                  }
                  <div class="text-sm roster-line">
                    <span class="muted">Approved by:</span>
                    {{ row.approverNames.names.length > 0 ? row.approverNames.names.join(', ') : '—' }}
                    @if (row.approverNames.unnamed > 0) {
                      <span class="muted">(+{{ row.approverNames.unnamed }} not named in the trail)</span>
                    }
                  </div>
                  @if (row.tally.concerns > 0) {
                    <div class="text-sm roster-line">
                      <span class="muted">Concern from:</span>
                      {{ row.concernNames.names.length > 0 ? row.concernNames.names.join(', ') : '—' }}
                    </div>
                  }
                </div>
              }
            }
          </div>

          <div class="stack">
            <span class="text-sm muted">Interview assignments</span>
            @if (allInterviews().length === 0) {
              <p class="muted">Nothing is currently awaiting an interview.</p>
            } @else {
              @for (row of allInterviews(); track row.id) {
                <div class="card row-between type-{{ row.type }}">
                  <div>
                    <strong>{{ row.title }}</strong>
                    <span class="type-tag type-tag-{{ row.type }}">{{ typeLabel(row.type) }}</span>
                    <p class="muted text-sm" style="margin: 0">{{ row.subtitle }}</p>
                  </div>
                  <div style="text-align: right">
                    @if (row.assignedTo) {
                      <p class="text-sm" style="margin: 0 0 0.4rem">
                        Assigned to <strong>{{ row.assignedTo }}</strong>
                      </p>
                    } @else {
                      <p class="muted text-sm" style="margin: 0 0 0.4rem">Unassigned</p>
                    }
                    <a class="btn btn-responsive" [routerLink]="row.link">View</a>
                  </div>
                </div>
              }
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .roster-line {
        line-height: 1.45;
      }
      .btn-sm {
        min-height: var(--tap);
        padding: 0.3rem 0.75rem;
        font-size: 0.85rem;
      }
      /* Left-border accent so a whole row/card reads as "calling" or
         "release" at a glance, without relying on the text tag alone. */
      .type-calling {
        border-left: 4px solid var(--primary);
      }
      .type-release {
        border-left: 4px solid var(--release);
      }
      .type-advancement {
        border-left: 4px solid var(--muted);
      }
      .type-tag {
        display: inline-block;
        margin-left: 0.4rem;
        padding: 0.1rem 0.5rem;
        border-radius: 999px;
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.02em;
        vertical-align: middle;
      }
      .type-tag-calling {
        background: color-mix(in srgb, var(--primary) 16%, white);
        color: var(--primary);
      }
      .type-tag-release {
        background: color-mix(in srgb, var(--release) 18%, var(--surface));
        color: var(--release);
      }
      .type-tag-advancement {
        background: color-mix(in srgb, var(--muted) 20%, white);
        color: var(--muted);
      }
    `,
  ],
})
export class AssignmentsComponent {
  protected readonly authService = inject(AuthService);
  protected readonly isPresidency = isPresidency;
  protected readonly typeLabel = (type: RowType) => TYPE_LABELS[type];

  /**
   * "All" vs. "Callings" vs. "Releases" toggle at the top of the page.
   * Advancements are neither, so selecting either non-"all" option hides
   * them too - the toggle answers "which of these direction-of-change rows
   * do I want," not "show me advancements as well."
   */
  protected readonly typeFilter = signal<'all' | 'calling' | 'release'>('all');

  private matchesFilter(type: RowType): boolean {
    const filter = this.typeFilter();
    return filter === 'all' || filter === type;
  }

  private readonly callingsService = inject(CallingsService);
  private readonly advancementsService = inject(PriesthoodAdvancementsService);

  private readonly workflows = toSignal(this.callingsService.listWorkflows(), {
    initialValue: [] as CallingWorkflow[],
  });

  private readonly advancementWorkflows = toSignal(this.advancementsService.listWorkflows(), {
    initialValue: [] as PriesthoodAdvancementWorkflow[],
  });

  /**
   * The signed-in high councilor's own outstanding votes - same predicate
   * behind the dashboard's "awaiting you" tiles, just surfaced as an actual
   * list here instead of a bare count. No per-workflow history lookup is
   * needed for this half: "is it waiting on me" only depends on the
   * workflow's own vote arrays, not on resolving anyone else's name.
   * Empty for a presidency user - callingAwaitsResponseFrom() is HC-only.
   */
  protected readonly myVotes = computed<PersonalRow[]>(() => {
    const user = this.authService.appUser();
    const callingRows: PersonalRow[] = this.workflows()
      .filter((w) => callingAwaitsResponseFrom(w, user))
      .map((w) => ({
        id: w.id,
        type: w.workflowType,
        title: w.callingName,
        subtitle: `${w.personName} · ${workflowScopeLabel(w.unit)}`,
        link: ['/callings', w.id],
      }));
    const advancementRows: PersonalRow[] = this.advancementWorkflows()
      .filter((w) => advancementAwaitsResponseFrom(w, user))
      .map((w) => ({
        id: w.id,
        type: 'advancement' as const,
        title: ADVANCEMENT_TYPE_LABELS[w.advancementType],
        subtitle: `${w.personName} · ${workflowScopeLabel(w.unit)}`,
        link: ['/advancements', w.id],
      }));
    return [...callingRows, ...advancementRows].filter((r) => this.matchesFilter(r.type));
  });

  /**
   * Callings/releases sitting at `interview_assigned` whose `assignedTo`
   * matches the signed-in user's display name. `assignedTo` is a plain
   * name string chosen from a dropdown of eligible people (or free-typed
   * when no one in the roster qualifies) - not a firebaseUid - so this is
   * a best-effort name match, not a guaranteed one. A mismatch (nickname,
   * a name typed differently than the Google account's) just means the
   * assignment silently doesn't show up here; the workflow itself is
   * unaffected; whoever assigned it can still find it from /callings.
   */
  protected readonly myInterviews = computed<PersonalRow[]>(() => {
    const user = this.authService.appUser();
    if (!user) return [];
    return this.workflows()
      .filter(
        (w) => w.status === INTERVIEW_ASSIGNED_STATUS && w.assignedTo === user.displayName,
      )
      .map((w) => ({
        id: w.id,
        type: w.workflowType,
        title: w.callingName,
        subtitle: `${w.personName} · ${workflowScopeLabel(w.unit)}`,
        link: ['/callings', w.id],
      }))
      .filter((r) => this.matchesFilter(r.type));
  });

  /**
   * Every calling/release/advancement currently at `proposed`, stake-wide -
   * the presidency's own first-review queue, before anything has been
   * approved or sent to the high council. No history lookup needed - like
   * allInterviews(), everything shown here (proposedDate) is already
   * denormalized directly on the workflow.
   */
  protected readonly allProposed = computed<ProposedRow[]>(() => {
    const callingRows: ProposedRow[] = this.workflows()
      .filter((w) => w.status === PROPOSED_STATUS)
      .map((w) => ({
        id: w.id,
        type: w.workflowType,
        title: w.callingName,
        subtitle: `${w.personName} · ${workflowScopeLabel(w.unit)}`,
        link: ['/callings', w.id],
        proposedDate: formatTimestamp(w.proposedDate),
      }));
    const advancementRows: ProposedRow[] = this.advancementWorkflows()
      .filter((w) => w.status === PROPOSED_STATUS)
      .map((w) => ({
        id: w.id,
        type: 'advancement' as const,
        title: ADVANCEMENT_TYPE_LABELS[w.advancementType],
        subtitle: `${w.personName} · ${workflowScopeLabel(w.unit)}`,
        link: ['/advancements', w.id],
        proposedDate: formatTimestamp(w.proposedDate),
      }));
    return [...callingRows, ...advancementRows].filter((r) => this.matchesFilter(r.type));
  });

  /**
   * Every workflow currently open for a High Council vote, stake-wide -
   * the presidency's view of what's outstanding. Unlike myVotes(), this
   * needs each workflow's own audit history to resolve approver/concern
   * uids to names (see hc-vote.ts's namesFor - a client can't read anyone
   * else's users/{uid} doc), so it re-subscribes to history() for
   * whichever workflows are currently open rather than reusing the plain
   * workflow list.
   */
  private readonly openCallingWorkflows = computed(() =>
    this.workflows().filter((w) => isCallingOpenForHcVote(w)),
  );

  private readonly openAdvancementWorkflows = computed(() =>
    this.advancementWorkflows().filter((w) => isAdvancementOpenForHcVote(w)),
  );

  private readonly outstandingCallings = toSignal(
    toObservable(this.openCallingWorkflows).pipe(
      switchMap((ws) =>
        ws.length === 0
          ? of([] as OutstandingVoteRow[])
          : combineLatest(
              ws.map((w) =>
                this.callingsService.history(w.id).pipe(
                  map(
                    (history): OutstandingVoteRow => ({
                      id: w.id,
                      type: w.workflowType,
                      title: w.callingName,
                      subtitle: `${w.personName} · ${workflowScopeLabel(w.unit)}`,
                      link: ['/callings', w.id],
                      tally: tally(w),
                      approverNames: namesFor(w.hcApprovalUids ?? [], history),
                      concernNames: namesFor(w.hcConcernUids ?? [], history),
                    }),
                  ),
                ),
              ),
            ),
      ),
    ),
    { initialValue: [] as OutstandingVoteRow[] },
  );

  private readonly outstandingAdvancements = toSignal(
    toObservable(this.openAdvancementWorkflows).pipe(
      switchMap((ws) =>
        ws.length === 0
          ? of([] as OutstandingVoteRow[])
          : combineLatest(
              ws.map((w) =>
                this.advancementsService.history(w.id).pipe(
                  map(
                    (history): OutstandingVoteRow => ({
                      id: w.id,
                      type: 'advancement' as const,
                      title: ADVANCEMENT_TYPE_LABELS[w.advancementType],
                      subtitle: `${w.personName} · ${workflowScopeLabel(w.unit)}`,
                      link: ['/advancements', w.id],
                      tally: tally(w),
                      approverNames: namesFor(w.hcApprovalUids ?? [], history),
                      concernNames: namesFor(w.hcConcernUids ?? [], history),
                    }),
                  ),
                ),
              ),
            ),
      ),
    ),
    { initialValue: [] as OutstandingVoteRow[] },
  );

  protected readonly outstandingVotes = computed(() =>
    [...this.outstandingCallings(), ...this.outstandingAdvancements()].filter((r) =>
      this.matchesFilter(r.type),
    ),
  );

  /**
   * Every calling/release currently at `interview_assigned`, stake-wide,
   * with whoever it's assigned to (or null when the field was left blank).
   * No history lookup needed here - unlike HC vote names, assignedTo is
   * already a plain string stored directly on the workflow.
   */
  protected readonly allInterviews = computed<InterviewAssignmentRow[]>(() =>
    this.workflows()
      .filter((w) => w.status === INTERVIEW_ASSIGNED_STATUS)
      .map((w) => ({
        id: w.id,
        type: w.workflowType,
        title: w.callingName,
        subtitle: `${w.personName} · ${workflowScopeLabel(w.unit)}`,
        link: ['/callings', w.id],
        assignedTo: w.assignedTo?.trim() || null,
      }))
      .filter((r) => this.matchesFilter(r.type)),
  );
}
