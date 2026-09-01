import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { CallingsService } from '../core/callings.service';
import { PeopleService } from '../core/people.service';
import { PriesthoodAdvancementsService } from '../core/priesthood-advancements.service';
import { canAdvanceStatus, isHighCouncil } from '../core/roles';
import {
  canCombineSustainAndSetApart,
  isPersonPresentInUnit,
  needsOrdination,
  needsSetApart,
  needsSustaining,
  needsSustainingIn,
  outstandingByUnit,
} from '../core/sunday-visit';
import { stakeUnits } from '../core/units';
import {
  ADVANCEMENT_TYPE_LABELS,
  type CallingWorkflow,
  type Person,
  type PriesthoodAdvancementWorkflow,
} from '../models/types';

/**
 * A councilor or presidency member picks the unit they're attending this
 * Sunday and sees exactly four things for it: new callings that still
 * need sustaining, releases that still need their vote of thanks, who's
 * ready to be set apart, and priesthood advancements ready for
 * ordination. Sustaining and setting apart get offered as one action for
 * a calling whenever this visit is both the last unit a stake-wide
 * calling needs and the room the person is actually in - see
 * core/sunday-visit.ts for that rule. Releases never combine with
 * setting apart, and ordinations never combine with anything - there's
 * no sustaining step for a priesthood advancement. Everything else
 * (proposing callings, HC votes, notes) stays on the workflow detail
 * page; this view exists only to answer "what do I do here today."
 */
@Component({
  selector: 'app-units',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="stack">
      <div>
        <h1 style="margin: 0 0 0.25rem">Units</h1>
        <p class="muted" style="margin: 0">
          Pick the unit you're attending to see what's outstanding there.
        </p>
      </div>

      <div class="card stack">
        <strong>Outlook</strong>
        @if (unitsWithOutstanding().length === 0) {
          <p class="text-sm muted" style="margin: 0">Nothing outstanding anywhere.</p>
        }
        @for (row of unitsWithOutstanding(); track row.unit.number) {
          <button
            type="button"
            class="unit-outlook-row"
            (click)="selectedUnit.set(row.unit.number)"
          >
            <strong>{{ row.unit.name }}</strong>
            <span class="row text-sm muted" style="gap: 1rem">
              @if (row.sustainings > 0) {
                <span>{{ row.sustainings }} sustaining{{ row.sustainings === 1 ? '' : 's' }}</span>
              }
              @if (row.releases > 0) {
                <span>{{ row.releases }} release{{ row.releases === 1 ? '' : 's' }}</span>
              }
              @if (row.setApart > 0) {
                <span>{{ row.setApart }} set apart</span>
              }
              @if (row.ordinations > 0) {
                <span>{{ row.ordinations }} ordination{{ row.ordinations === 1 ? '' : 's' }}</span>
              }
            </span>
          </button>
        }
      </div>

      <div class="field">
        <label for="unit">Unit</label>
        <select id="unit" [ngModel]="selectedUnit()" (ngModelChange)="selectedUnit.set($event)">
          <option value="" disabled>Select a unit…</option>
          @for (u of stakeUnitsList; track u.number) {
            <option [value]="u.number">{{ u.name }}</option>
          }
        </select>
      </div>

      @if (selectedUnit()) {
        <div class="card stack">
          <strong>Needs sustaining</strong>
          @if (pendingSustaining().length === 0) {
            <p class="text-sm muted" style="margin: 0">Nothing outstanding here.</p>
          }
          @for (row of pendingSustaining(); track row.workflow.id) {
            <div class="row-between sunday-row">
              <div>
                <a [routerLink]="['/callings', row.workflow.id]">{{ row.workflow.personName }}</a>
                <span class="muted"> — {{ row.workflow.callingName }}</span>
                @if (!row.workflow.unit) {
                  <p class="text-sm muted" style="margin: 0.15rem 0 0">
                    Stake-wide &middot; {{ row.sustainedCount }} of {{ stakeUnitsList.length }} units done
                  </p>
                }
              </div>
              @if (row.canAct) {
                <div class="row">
                  @if (row.canCombine) {
                    <button class="btn btn-primary" [disabled]="busy()" (click)="sustainAndSetApart(row.workflow)">
                      Sustain &amp; set apart
                    </button>
                    <button class="btn" [disabled]="busy()" (click)="sustainOnly(row.workflow)">
                      Sustain only
                    </button>
                  } @else {
                    <button class="btn btn-primary" [disabled]="busy()" (click)="sustainOnly(row.workflow)">
                      Mark sustained here
                    </button>
                  }
                </div>
              } @else {
                <span class="text-sm muted">Only the presidency or high council can record this.</span>
              }
            </div>
          }
        </div>

        <div class="card stack">
          <strong>Releases</strong>
          @if (pendingReleases().length === 0) {
            <p class="text-sm muted" style="margin: 0">Nothing outstanding here.</p>
          }
          @for (row of pendingReleases(); track row.workflow.id) {
            <div class="row-between sunday-row">
              <div>
                <a [routerLink]="['/callings', row.workflow.id]">{{ row.workflow.personName }}</a>
                <span class="muted"> — {{ row.workflow.callingName }}</span>
                @if (!row.workflow.unit) {
                  <p class="text-sm muted" style="margin: 0.15rem 0 0">
                    Stake-wide &middot; {{ row.sustainedCount }} of {{ stakeUnitsList.length }} units done
                  </p>
                }
              </div>
              @if (row.canAct) {
                <button class="btn btn-primary" [disabled]="busy()" (click)="sustainOnly(row.workflow)">
                  Record vote of thanks
                </button>
              } @else {
                <span class="text-sm muted">Only the presidency or high council can record this.</span>
              }
            </div>
          }
        </div>

        <div class="card stack">
          <strong>Needs setting apart</strong>
          @if (pendingSetApart().length === 0) {
            <p class="text-sm muted" style="margin: 0">Nothing outstanding here.</p>
          }
          @for (row of pendingSetApart(); track row.workflow.id) {
            <div class="row-between sunday-row">
              <div>
                <a [routerLink]="['/callings', row.workflow.id]">{{ row.workflow.personName }}</a>
                <span class="muted"> — {{ row.workflow.callingName }}</span>
              </div>
              @if (row.canAct) {
                <button class="btn btn-primary" [disabled]="busy()" (click)="setApart(row.workflow)">
                  Set apart
                </button>
              } @else {
                <span class="text-sm muted">Only the presidency or high council can record this.</span>
              }
            </div>
          }
        </div>

        <div class="card stack">
          <strong>Ordinations pending</strong>
          @if (pendingOrdinations().length === 0) {
            <p class="text-sm muted" style="margin: 0">Nothing outstanding here.</p>
          }
          @for (row of pendingOrdinations(); track row.workflow.id) {
            <div class="row-between sunday-row">
              <div>
                <a [routerLink]="['/advancements', row.workflow.id]">{{ row.workflow.personName }}</a>
                <span class="muted"> — {{ advancementTypeLabels[row.workflow.advancementType] }}</span>
              </div>
              @if (isHighCouncil(authService.appUser())) {
                @if (row.canAct) {
                  <button class="btn btn-primary" [disabled]="busy()" (click)="ordain(row.workflow)">
                    Ordain
                  </button>
                } @else {
                  <span class="text-sm muted">Only the presidency or high council can record this.</span>
                }
              } @else {
                <!-- The person who actually performs an ordination is
                     often a family member, not whoever's recording it -
                     the detail page's search picker handles that; a
                     one-click self-attributed button here would be wrong
                     most of the time. -->
                <a class="btn" [routerLink]="['/advancements', row.workflow.id]">
                  Record ordination
                </a>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .sunday-row { align-items: flex-start; padding: 0.5rem 0; border-top: 1px solid var(--border); }
      .sunday-row:first-of-type { border-top: none; padding-top: 0; }

      /* A plain button reset to look and lay out like a row, not a button -
         clicking it just selects the unit in place, no navigation. */
      .unit-outlook-row {
        all: unset;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.5rem 0.75rem;
        width: 100%;
        box-sizing: border-box;
        padding: 0.5rem 0;
        border-top: 1px solid var(--border);
        cursor: pointer;
      }
      .unit-outlook-row:first-of-type { border-top: none; padding-top: 0; }
      .unit-outlook-row:hover, .unit-outlook-row:focus-visible { background: var(--bg); }
    `,
  ],
})
export class UnitsComponent {
  protected readonly authService = inject(AuthService);
  private readonly callingsService = inject(CallingsService);
  private readonly peopleService = inject(PeopleService);
  private readonly advancementsService = inject(PriesthoodAdvancementsService);
  private readonly route = inject(ActivatedRoute);

  protected readonly advancementTypeLabels = ADVANCEMENT_TYPE_LABELS;
  protected readonly isHighCouncil = isHighCouncil;
  protected readonly stakeUnitsList = stakeUnits();
  // Pre-selected from the dashboard's per-unit outstanding summary
  // (?unit=<number>) so a tap there lands here already filtered.
  protected readonly selectedUnit = signal(this.route.snapshot.queryParamMap.get('unit') ?? '');
  protected readonly busy = signal(false);

  private readonly workflows = toSignal(this.callingsService.listWorkflows(), {
    initialValue: [] as CallingWorkflow[],
  });
  private readonly advancementWorkflows = toSignal(this.advancementsService.listWorkflows(), {
    initialValue: [] as PriesthoodAdvancementWorkflow[],
  });
  private readonly people = toSignal(this.peopleService.list(), {
    initialValue: [] as Person[],
  });
  private readonly peopleById = computed(() => new Map(this.people().map((p) => [p.id, p])));

  private personFor(w: { personId: string }): Person | null {
    return this.people().find((p) => p.id === w.personId) ?? null;
  }

  /** Stake-wide summary of what's outstanding in each unit - lets a
   *  presidency/HC member jump straight to a unit with something pending
   *  instead of stepping through the dropdown blind. Moved here from the
   *  dashboard so this page carries its own "what needs attention" view. */
  protected readonly unitsWithOutstanding = computed(() =>
    outstandingByUnit(this.workflows(), this.advancementWorkflows(), this.peopleById()).filter(
      (row) => row.sustainings + row.releases + row.setApart + row.ordinations > 0,
    ),
  );

  /** Shared eligibility for anything (calling or release) that still
   *  needs sustaining in `unit` - split into pendingSustaining and
   *  pendingReleases below by workflowType. */
  private eligibleForSustaining(unit: string) {
    const actor = this.authService.appUser();
    return this.workflows()
      .filter((w) => needsSustaining(w))
      .filter((w) => needsSustainingIn(w, unit))
      .map((w) => ({
        workflow: w,
        sustainedCount: w.sustainedInUnits?.length ?? 0,
        canCombine: canCombineSustainAndSetApart(w, this.personFor(w), unit),
        canAct: canAdvanceStatus(actor, w.status, 'sustained'),
      }));
  }

  protected readonly pendingSustaining = computed(() => {
    const unit = this.selectedUnit();
    if (!unit) return [];
    return this.eligibleForSustaining(unit).filter((row) => row.workflow.workflowType === 'calling');
  });

  protected readonly pendingReleases = computed(() => {
    const unit = this.selectedUnit();
    if (!unit) return [];
    return this.eligibleForSustaining(unit).filter((row) => row.workflow.workflowType === 'release');
  });

  protected readonly pendingSetApart = computed(() => {
    const unit = this.selectedUnit();
    if (!unit) return [];
    const actor = this.authService.appUser();
    return this.workflows()
      .filter((w) => needsSetApart(w))
      .filter((w) => isPersonPresentInUnit(w, this.personFor(w), unit))
      .map((w) => ({
        workflow: w,
        canAct: canAdvanceStatus(actor, w.status, 'set_apart'),
      }));
  });

  protected readonly pendingOrdinations = computed(() => {
    const unit = this.selectedUnit();
    if (!unit) return [];
    const actor = this.authService.appUser();
    return this.advancementWorkflows()
      .filter((w) => needsOrdination(w))
      .filter((w) => isPersonPresentInUnit(w, this.personFor(w), unit))
      .map((w) => ({
        workflow: w,
        canAct: canAdvanceStatus(actor, w.status, 'ordained'),
      }));
  });

  async sustainAndSetApart(w: CallingWorkflow): Promise<void> {
    const actor = this.authService.appUser();
    if (!actor) return;
    this.busy.set(true);
    try {
      const unit = w.unit ? undefined : this.selectedUnit();
      await this.callingsService.sustainAndSetApart(w, unit, actor);
    } finally {
      this.busy.set(false);
    }
  }

  async sustainOnly(w: CallingWorkflow): Promise<void> {
    const actor = this.authService.appUser();
    if (!actor) return;
    this.busy.set(true);
    try {
      if (w.unit) {
        await this.callingsService.advanceStatus(w, 'sustained', actor);
      } else {
        await this.callingsService.markUnitSustained(w, this.selectedUnit(), actor);
      }
    } finally {
      this.busy.set(false);
    }
  }

  async setApart(w: CallingWorkflow): Promise<void> {
    const actor = this.authService.appUser();
    if (!actor) return;
    this.busy.set(true);
    try {
      await this.callingsService.advanceStatus(w, 'set_apart', actor, {
        setApartBy: actor.displayName,
      });
    } finally {
      this.busy.set(false);
    }
  }

  async ordain(w: PriesthoodAdvancementWorkflow): Promise<void> {
    const actor = this.authService.appUser();
    if (!actor) return;
    this.busy.set(true);
    try {
      await this.advancementsService.advanceStatus(w, 'ordained', actor, {
        ordainedBy: actor.displayName,
      });
    } finally {
      this.busy.set(false);
    }
  }
}
