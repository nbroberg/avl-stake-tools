import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CallingsService } from '../../core/callings.service';
import { canCreateWorkflow } from '../../core/roles';
import { workflowScopeLabel } from '../../core/units';
import { awaitsResponseFrom } from '../../core/hc-review';
import { AuthService } from '../../core/auth.service';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import {
  CALLING_STATUS_LABELS,
  RELEASE_STATUS_LABELS,
  type CallingWorkflow,
} from '../../models/types';

function labelFor(w: CallingWorkflow): string {
  const labels = w.workflowType === 'release' ? RELEASE_STATUS_LABELS : CALLING_STATUS_LABELS;
  return (labels as Record<string, string>)[w.status] ?? w.status;
}

@Component({
  selector: 'app-callings-list',
  standalone: true,
  imports: [FormsModule, RouterLink, StatusBadgeComponent],
  styles: [
    `
      .awaiting-banner {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.6rem;
        padding: 0.7rem 0.85rem;
        border-radius: 10px;
        border: 1px solid var(--primary);
        background: var(--surface);
        border-left-width: 4px;
      }
      .awaiting-pill {
        display: inline-block;
        margin-top: 0.35rem;
        padding: 0.15rem 0.5rem;
        border-radius: 999px;
        background: #dbe7f5;
        color: var(--primary);
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.02em;
      }
      .btn-sm {
        min-height: var(--tap);
        padding: 0.3rem 0.75rem;
        font-size: 0.85rem;
      }
    `,
  ],
  template: `
    <div class="stack">
      <div class="row-between">
        <h1 style="margin: 0">Callings &amp; Sustainings</h1>
        @if (canCreateWorkflow(authService.appUser())) {
          <a class="btn btn-primary btn-row-action" routerLink="/callings/new">+ New</a>
        }
      </div>

      <!-- A high councilor's whole job here is "what needs me?", so that
           answer leads the page instead of being buried one tap deep. -->
      @if (awaitingCount() > 0) {
        <div class="awaiting-banner">
          <strong>
            {{ awaitingCount() }}
            {{ awaitingCount() === 1 ? 'proposal awaits' : 'proposals await' }} your response
          </strong>
          <button
            type="button"
            class="btn btn-sm"
            (click)="onlyAwaiting.set(!onlyAwaiting())"
          >
            {{ onlyAwaiting() ? 'Show all' : 'Show only these' }}
          </button>
        </div>
      }

      <label class="row text-sm muted" style="gap: 0.5rem; min-height: var(--tap)">
        <input
          type="checkbox"
          [ngModel]="showComplete()"
          (ngModelChange)="showComplete.set($event)"
        />
        Show completed
      </label>

      @if (workflows() === null) {
        <p class="muted">Loading…</p>
      } @else {
        @if (visible().length === 0) {
          <p class="muted">
            {{ onlyAwaiting() ? 'Nothing is waiting on you right now.' : 'No workflows yet.' }}
          </p>
        }

        <div class="stack">
          @for (w of visible(); track w.id) {
            <a class="list-item" [routerLink]="['/callings', w.id]">
              <div class="row-between">
                <div style="min-width: 0">
                  <strong>{{ w.callingName }}</strong>
                  <div class="muted text-sm">
                    {{ w.personName }} &middot; {{ workflowScopeLabel(w.unit) }} &middot;
                    {{ w.workflowType === 'release' ? 'Release' : 'Calling' }}
                  </div>
                  @if (awaitsMe(w)) {
                    <span class="awaiting-pill">Awaiting your response</span>
                  }
                </div>
                <app-status-badge [status]="w.status" [label]="labelFor(w)" />
              </div>
            </a>
          }
        </div>
      }
    </div>
  `,
})
export class CallingsListComponent {
  protected readonly authService = inject(AuthService);
  protected readonly canCreateWorkflow = canCreateWorkflow;
  protected readonly labelFor = labelFor;
  protected readonly workflowScopeLabel = workflowScopeLabel;
  protected readonly showComplete = signal(false);
  protected readonly onlyAwaiting = signal(false);

  private readonly callingsService = inject(CallingsService);
  protected readonly workflows = toSignal(this.callingsService.listWorkflows(), {
    initialValue: null,
  });

  /** Workflows this signed-in high councilor still owes a response. */
  protected readonly awaitingMine = computed(() => {
    const user = this.authService.appUser();
    return (this.workflows() ?? []).filter((w) => awaitsResponseFrom(w, user));
  });

  protected readonly awaitingCount = computed(() => this.awaitingMine().length);

  protected readonly visible = computed(() => {
    const items = this.workflows();
    if (!items) return [];
    if (this.onlyAwaiting()) return this.awaitingMine();
    return this.showComplete() ? items : items.filter((w) => w.status !== 'complete');
  });

  protected awaitsMe(w: CallingWorkflow): boolean {
    return awaitsResponseFrom(w, this.authService.appUser());
  }
}
