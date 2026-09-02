import { Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { combineLatest, map, of, switchMap } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { CallingsService } from '../core/callings.service';
import { PriesthoodAdvancementsService } from '../core/priesthood-advancements.service';
import {
  awaitsResponseFrom as awaitsCallingResponseFrom,
  isOpenForHighCouncilVote as isCallingOpenForHcVote,
  namesFor as callingNamesFor,
  tally as callingTally,
} from '../core/hc-review';
import {
  awaitsResponseFrom as awaitsAdvancementResponseFrom,
  isOpenForHighCouncilVote as isAdvancementOpenForHcVote,
  namesFor as advancementNamesFor,
  tally as advancementTally,
} from '../core/advancement-review';
import { isHighCouncil, isPresidency } from '../core/roles';
import { workflowScopeLabel } from '../core/units';
import type { HcTally } from '../core/hc-vote';
import {
  ADVANCEMENT_TYPE_LABELS,
  type CallingWorkflow,
  type PriesthoodAdvancementWorkflow,
} from '../models/types';

interface PersonalRow {
  id: string;
  title: string;
  subtitle: string;
  link: string[];
}

interface OutstandingRow extends PersonalRow {
  tally: HcTally;
  approverNames: { names: string[]; unnamed: number };
  concernNames: { names: string[]; unnamed: number };
}

@Component({
  selector: 'app-hc-approvals',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="stack">
      <h1 style="margin-bottom: 0">High Council Approvals</h1>

      @if (isHighCouncil(authService.appUser())) {
        <div class="stack">
          <strong>Your outstanding votes</strong>
          @if (myOutstanding().length === 0) {
            <p class="muted">Nothing is waiting on your approval right now.</p>
          } @else {
            <div class="stack">
              @for (row of myOutstanding(); track row.id) {
                <a class="list-item" [routerLink]="row.link">
                  <strong>{{ row.title }}</strong>
                  <div class="muted text-sm">{{ row.subtitle }}</div>
                </a>
              }
            </div>
          }
        </div>
      }

      @if (isPresidency(authService.appUser())) {
        <div class="stack">
          <strong>Outstanding across the High Council</strong>
          @if (outstanding().length === 0) {
            <p class="muted">Nothing is currently awaiting a High Council vote.</p>
          } @else {
            @for (row of outstanding(); track row.id) {
              <div class="card stack">
                <div class="row-between">
                  <div>
                    <strong>{{ row.title }}</strong>
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
      }
    </div>
  `,
  styles: [
    `
      .roster-line {
        line-height: 1.45;
      }
    `,
  ],
})
export class HcApprovalsComponent {
  protected readonly authService = inject(AuthService);
  protected readonly isHighCouncil = isHighCouncil;
  protected readonly isPresidency = isPresidency;

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
   */
  protected readonly myOutstanding = computed<PersonalRow[]>(() => {
    const user = this.authService.appUser();
    const callingRows: PersonalRow[] = this.workflows()
      .filter((w) => awaitsCallingResponseFrom(w, user))
      .map((w) => ({
        id: w.id,
        title: w.callingName,
        subtitle: `${w.personName} · ${workflowScopeLabel(w.unit)}`,
        link: ['/callings', w.id],
      }));
    const advancementRows: PersonalRow[] = this.advancementWorkflows()
      .filter((w) => awaitsAdvancementResponseFrom(w, user))
      .map((w) => ({
        id: w.id,
        title: ADVANCEMENT_TYPE_LABELS[w.advancementType],
        subtitle: `${w.personName} · ${workflowScopeLabel(w.unit)}`,
        link: ['/advancements', w.id],
      }));
    return [...callingRows, ...advancementRows];
  });

  /**
   * Every workflow currently open for a High Council vote, stake-wide -
   * the presidency's view of what's outstanding. Unlike myOutstanding(),
   * this needs each workflow's own audit history to resolve approver/
   * concern uids to names (see hc-vote.ts's namesFor - a client can't read
   * anyone else's users/{uid} doc), so it re-subscribes to history() for
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
          ? of([] as OutstandingRow[])
          : combineLatest(
              ws.map((w) =>
                this.callingsService.history(w.id).pipe(
                  map(
                    (history): OutstandingRow => ({
                      id: w.id,
                      title: w.callingName,
                      subtitle: `${w.personName} · ${workflowScopeLabel(w.unit)}`,
                      link: ['/callings', w.id],
                      tally: callingTally(w),
                      approverNames: callingNamesFor(w.hcApprovalUids ?? [], history),
                      concernNames: callingNamesFor(w.hcConcernUids ?? [], history),
                    }),
                  ),
                ),
              ),
            ),
      ),
    ),
    { initialValue: [] as OutstandingRow[] },
  );

  private readonly outstandingAdvancements = toSignal(
    toObservable(this.openAdvancementWorkflows).pipe(
      switchMap((ws) =>
        ws.length === 0
          ? of([] as OutstandingRow[])
          : combineLatest(
              ws.map((w) =>
                this.advancementsService.history(w.id).pipe(
                  map(
                    (history): OutstandingRow => ({
                      id: w.id,
                      title: ADVANCEMENT_TYPE_LABELS[w.advancementType],
                      subtitle: `${w.personName} · ${workflowScopeLabel(w.unit)}`,
                      link: ['/advancements', w.id],
                      tally: advancementTally(w),
                      approverNames: advancementNamesFor(w.hcApprovalUids ?? [], history),
                      concernNames: advancementNamesFor(w.hcConcernUids ?? [], history),
                    }),
                  ),
                ),
              ),
            ),
      ),
    ),
    { initialValue: [] as OutstandingRow[] },
  );

  protected readonly outstanding = computed(() => [
    ...this.outstandingCallings(),
    ...this.outstandingAdvancements(),
  ]);
}
