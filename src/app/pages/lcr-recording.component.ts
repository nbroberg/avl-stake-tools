import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { CallingsService } from '../core/callings.service';
import { canRecordInLcr, canUndoRecordInLcr, isPresidency } from '../core/roles';
import { requiredUnitsFor } from '../core/sunday-visit';
import { workflowScopeLabel } from '../core/units';
import { formatTimestamp } from '../core/calling-status';
import type { CallingWorkflow } from '../models/types';

/**
 * Stake Presidency-only worklist: every calling or release at least one
 * unit has sustained but LCR hasn't recorded yet. Recording is done
 * manually in LCR outside this app - marking it here only records that
 * it happened, when, and by whom (via the audit history), and
 * deliberately doesn't close the workflow by itself (see
 * CallingsService.recordInLcr and core/calling-status.ts's Finalizing
 * design). A workflow's own detail page has the same Mark recorded/Undo
 * control - this page just gathers everything waiting on it in one
 * place, the way Callings & Releases gathers everything waiting on a
 * High Council vote.
 */
@Component({
  selector: 'app-lcr-recording',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="stack">
      <h1 style="margin: 0">LCR Recording</h1>

      @if (!isPresidency(authService.appUser())) {
        <p class="muted">This page is for the Stake Presidency.</p>
      } @else {
        <p class="muted" style="margin: 0">
          Callings and releases at least one unit has sustained, not yet marked as recorded in
          LCR. Recording itself still happens in LCR - marking it here just records that it
          happened.
        </p>

        @if (workflows() === null) {
          <p class="muted">Loading…</p>
        } @else if (readyToRecord().length === 0) {
          <p class="muted">Nothing waiting on LCR recording right now.</p>
        }

        <div class="stack">
          @for (w of readyToRecord(); track w.id) {
            <div class="card row-between">
              <div style="min-width: 0">
                <strong>{{ w.callingName }}</strong>
                <div class="muted text-sm">
                  {{ w.personName }} &middot; {{ workflowScopeLabel(w.unit) }} &middot;
                  {{ w.workflowType === 'release' ? 'Release' : 'Calling' }}
                </div>
                <div class="muted text-sm">
                  {{ sustainedCount(w) }} of {{ requiredUnitCount(w) }} units sustained
                </div>
              </div>
              <div class="row" style="flex-wrap: wrap">
                <a class="btn text-sm" [routerLink]="['/callings', w.id]">View</a>
                @if (canRecordInLcr(authService.appUser())) {
                  <button class="btn btn-primary" [disabled]="busy()" (click)="recordInLcr(w)">
                    Mark recorded
                  </button>
                }
              </div>
            </div>
          }
        </div>

        <label class="row text-sm muted" style="gap: 0.5rem; min-height: var(--tap)">
          <input type="checkbox" [ngModel]="showRecorded()" (ngModelChange)="showRecorded.set($event)" />
          Show recorded, not yet complete
        </label>

        @if (showRecorded()) {
          <div class="stack">
            @if (recordedNotComplete().length === 0) {
              <p class="text-sm muted" style="margin: 0">Nothing recorded and still open.</p>
            }
            @for (w of recordedNotComplete(); track w.id) {
              <div class="card row-between">
                <div style="min-width: 0">
                  <strong>{{ w.callingName }}</strong>
                  <div class="muted text-sm">
                    {{ w.personName }} &middot; {{ workflowScopeLabel(w.unit) }}
                  </div>
                  <div class="muted text-sm">Recorded on {{ formatTimestamp(w.recordedDate) }}</div>
                </div>
                <div class="row" style="flex-wrap: wrap">
                  <a class="btn text-sm" [routerLink]="['/callings', w.id]">View</a>
                  @if (canUndoRecordInLcr(authService.appUser())) {
                    <button class="btn" [disabled]="busy()" (click)="undoRecordInLcr(w)">Undo</button>
                  }
                </div>
              </div>
            }
          </div>
        }
      }
    </div>
  `,
})
export class LcrRecordingComponent {
  protected readonly authService = inject(AuthService);
  protected readonly isPresidency = isPresidency;
  protected readonly canRecordInLcr = canRecordInLcr;
  protected readonly canUndoRecordInLcr = canUndoRecordInLcr;
  protected readonly workflowScopeLabel = workflowScopeLabel;
  protected readonly formatTimestamp = formatTimestamp;
  protected readonly showRecorded = signal(false);
  protected readonly busy = signal(false);

  private readonly callingsService = inject(CallingsService);
  protected readonly workflows = toSignal(this.callingsService.listWorkflows(), {
    initialValue: null,
  });

  /** At least one unit has sustained (status only reaches `sustained` or
   *  `set_apart` once that's true) and LCR hasn't recorded it yet. */
  protected readonly readyToRecord = computed(() =>
    (this.workflows() ?? []).filter((w) => w.status === 'sustained' || w.status === 'set_apart'),
  );

  /** Recorded, but not yet fully closed - the undo shelf. */
  protected readonly recordedNotComplete = computed(() =>
    (this.workflows() ?? []).filter((w) => w.status === 'recorded_in_lcr'),
  );

  protected sustainedCount(w: CallingWorkflow): number {
    return (w.sustainedInUnits ?? []).length;
  }

  protected requiredUnitCount(w: CallingWorkflow): number {
    return requiredUnitsFor(w).length;
  }

  async recordInLcr(w: CallingWorkflow): Promise<void> {
    const actor = this.authService.appUser();
    if (!actor) return;
    this.busy.set(true);
    try {
      await this.callingsService.recordInLcr(w, actor);
    } finally {
      this.busy.set(false);
    }
  }

  async undoRecordInLcr(w: CallingWorkflow): Promise<void> {
    const actor = this.authService.appUser();
    if (!actor) return;
    this.busy.set(true);
    try {
      await this.callingsService.undoRecordInLcr(w, actor);
    } finally {
      this.busy.set(false);
    }
  }
}
