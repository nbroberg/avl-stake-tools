import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { CallingsService } from '../core/callings.service';
import { PeopleService } from '../core/people.service';
import { canAdvanceStatus } from '../core/roles';
import {
  canCombineSustainAndSetApart,
  isPersonPresentInUnit,
  needsSetApart,
  needsSustaining,
} from '../core/sunday-visit';
import { stakeUnits } from '../core/units';
import type { CallingWorkflow, Person } from '../models/types';

/**
 * A councilor or presidency member picks the unit they're attending this
 * Sunday and sees exactly two things for it: what still needs sustaining
 * there, and who's ready to be set apart there. Sustaining and setting
 * apart get offered as one action whenever this visit is both the last
 * unit a stake-wide calling needs and the room the person is actually in
 * - see core/sunday-visit.ts for that rule. Everything else (proposing
 * callings, HC votes, notes) stays on the workflow detail page; this
 * view exists only to answer "what do I do here today."
 */
@Component({
  selector: 'app-sunday-visit',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="stack">
      <div>
        <h1 style="margin: 0 0 0.25rem">Sunday Visit</h1>
        <p class="muted" style="margin: 0">
          Pick the unit you're attending to see what's outstanding there.
        </p>
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
      }
    </div>
  `,
  styles: [
    `
      .sunday-row { align-items: flex-start; padding: 0.5rem 0; border-top: 1px solid var(--border); }
      .sunday-row:first-of-type { border-top: none; padding-top: 0; }
    `,
  ],
})
export class SundayVisitComponent {
  protected readonly authService = inject(AuthService);
  private readonly callingsService = inject(CallingsService);
  private readonly peopleService = inject(PeopleService);

  protected readonly stakeUnitsList = stakeUnits();
  protected readonly selectedUnit = signal('');
  protected readonly busy = signal(false);

  private readonly workflows = toSignal(this.callingsService.listWorkflows(), {
    initialValue: [] as CallingWorkflow[],
  });
  private readonly people = toSignal(this.peopleService.list(), {
    initialValue: [] as Person[],
  });

  private personFor(w: CallingWorkflow): Person | null {
    return this.people().find((p) => p.id === w.personId) ?? null;
  }

  protected readonly pendingSustaining = computed(() => {
    const unit = this.selectedUnit();
    if (!unit) return [];
    const actor = this.authService.appUser();
    return this.workflows()
      .filter((w) => needsSustaining(w))
      .filter((w) => (w.unit ? w.unit === unit : !(w.sustainedInUnits ?? []).includes(unit)))
      .map((w) => ({
        workflow: w,
        sustainedCount: w.sustainedInUnits?.length ?? 0,
        canCombine: canCombineSustainAndSetApart(w, this.personFor(w), unit),
        canAct: canAdvanceStatus(actor, w.status, 'sustained'),
      }));
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
}
