import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { CallingsService } from '../core/callings.service';
import { PriesthoodAdvancementsService } from '../core/priesthood-advancements.service';
import { RosterSyncService } from '../core/roster-sync.service';
import { awaitsResponseFrom } from '../core/hc-review';
import { awaitsResponseFrom as awaitsAdvancementResponseFrom } from '../core/advancement-review';
import { isHighCouncil, isPresidency } from '../core/roles';
import type { PriesthoodAdvancementWorkflow, RosterSyncStatus } from '../models/types';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink],
  styles: [
    `
      .call-to-action {
        display: block;
        padding: 0.9rem;
        border-radius: 10px;
        border: 1px solid var(--primary);
        border-left-width: 4px;
        background: var(--surface);
        text-decoration: none;
        color: inherit;
      }
      .cta-count {
        font-size: 1.6rem;
        font-weight: 600;
        color: var(--primary);
        line-height: 1.1;
      }
    `,
  ],
  template: `
    <div class="stack">
      <h1 style="margin-bottom: 0">
        Welcome{{ authService.appUser() ? ', ' + authService.appUser()!.displayName : '' }}
      </h1>

      @if (isPresidency(authService.appUser()) && rosterSyncPending()) {
        <div class="card stack" style="border-left: 3px solid var(--warn)">
          <strong>Roster sync required</strong>
          <p class="text-sm muted" style="margin: 0">
            A workflow was recorded in LCR, so the local roster may be behind. Re-run the LCR
            sync, then mark it done here.
          </p>
          <button class="btn btn-responsive" [disabled]="clearingSync()" (click)="clearRosterSync()">
            Mark roster synced
          </button>
        </div>
      }

      <!-- A high councilor signing in has one question: what needs me? Answer
           it before the generic navigation, and say so plainly when the
           answer is "nothing". -->
      @if (isHighCouncil(authService.appUser())) {
        @if (awaitingCount() > 0) {
          <a class="call-to-action" routerLink="/assignments">
            <div class="cta-count">{{ awaitingCount() }}</div>
            <strong>
              {{ awaitingCount() === 1 ? 'proposal awaits' : 'proposals await' }} your response
            </strong>
            <div class="muted text-sm">
              Review and record your approval, or raise a concern.
            </div>
          </a>
        }
        @if (awaitingAdvancementCount() > 0) {
          <a class="call-to-action" routerLink="/assignments">
            <div class="cta-count">{{ awaitingAdvancementCount() }}</div>
            <strong>
              priesthood {{ awaitingAdvancementCount() === 1 ? 'advancement awaits' : 'advancements await' }}
              your response
            </strong>
            <div class="muted text-sm">
              Review and record your approval, or raise a concern.
            </div>
          </a>
        }
        @if (awaitingCount() === 0 && awaitingAdvancementCount() === 0) {
          <p class="muted">Nothing is waiting on your approval right now.</p>
        }
      } @else {
        <p class="muted">Pick a workflow to get started.</p>
      }

      <div class="stack">
        <a class="list-item" routerLink="/units">
          <strong>Units</strong>
          <div class="muted text-sm">See what's outstanding per unit, and record it there.</div>
        </a>
        <a class="list-item" routerLink="/assignments">
          <strong>Assignments</strong>
          <div class="muted text-sm">
            Your outstanding votes and interviews, plus everything outstanding stake-wide.
          </div>
        </a>
        <a class="list-item" routerLink="/callings">
          <strong>Callings &amp; Releases</strong>
          <div class="muted text-sm">Track proposed callings and releases through completion.</div>
        </a>
        <a class="list-item" routerLink="/advancements">
          <strong>Priesthood Advancements</strong>
          <div class="muted text-sm">Track Priest→Elder and Elder→High Priest approvals.</div>
        </a>
        <a class="list-item" routerLink="/diagnostics">
          <strong>Diagnostics</strong>
          <div class="muted text-sm">Check Firebase Auth and Firestore connectivity.</div>
        </a>
      </div>
    </div>
  `,
})
export class DashboardComponent {
  protected readonly authService = inject(AuthService);
  protected readonly isHighCouncil = isHighCouncil;
  protected readonly isPresidency = isPresidency;

  private readonly rosterSyncService = inject(RosterSyncService);
  private readonly rosterSync = toSignal(this.rosterSyncService.watch(), {
    initialValue: null as RosterSyncStatus | null,
  });
  protected readonly rosterSyncPending = computed(() => this.rosterSync()?.pending === true);
  protected readonly clearingSync = signal(false);

  private readonly callingsService = inject(CallingsService);
  private readonly workflows = toSignal(this.callingsService.listWorkflows(), {
    initialValue: [],
  });

  private readonly advancementsService = inject(PriesthoodAdvancementsService);
  private readonly advancementWorkflows = toSignal(this.advancementsService.listWorkflows(), {
    initialValue: [] as PriesthoodAdvancementWorkflow[],
  });

  protected readonly awaitingCount = computed(() => {
    const user = this.authService.appUser();
    return this.workflows().filter((w) => awaitsResponseFrom(w, user)).length;
  });

  protected readonly awaitingAdvancementCount = computed(() => {
    const user = this.authService.appUser();
    return this.advancementWorkflows().filter((w) => awaitsAdvancementResponseFrom(w, user))
      .length;
  });

  async clearRosterSync(): Promise<void> {
    const actor = this.authService.appUser();
    if (!actor) return;
    this.clearingSync.set(true);
    try {
      await this.rosterSyncService.clear(actor);
    } finally {
      this.clearingSync.set(false);
    }
  }
}
