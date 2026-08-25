import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CallingsService } from '../../core/callings.service';
import { canCreateWorkflow } from '../../core/roles';
import { workflowScopeLabel } from '../../core/units';
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
  template: `
    <div class="stack">
      <div class="row-between">
        <h1 style="margin: 0">Callings &amp; Sustainings</h1>
        @if (canCreateWorkflow(authService.appUser())) {
          <a class="btn btn-primary" routerLink="/callings/new">+ New</a>
        }
      </div>

      <label class="row text-sm muted" style="gap: 0.4rem">
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
          <p class="muted">No workflows yet.</p>
        }

        <div class="stack">
          @for (w of visible(); track w.id) {
            <a class="list-item" [routerLink]="['/callings', w.id]">
              <div class="row-between">
                <div>
                  <strong>{{ w.callingName }}</strong>
                  <div class="muted text-sm">
                    {{ w.personName }} &middot; {{ workflowScopeLabel(w.unit) }} &middot;
                    {{ w.workflowType === 'release' ? 'Release' : 'Calling' }}
                  </div>
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

  private readonly callingsService = inject(CallingsService);
  protected readonly workflows = toSignal(this.callingsService.listWorkflows(), {
    initialValue: null,
  });

  protected readonly visible = computed(() => {
    const items = this.workflows();
    if (!items) return [];
    return this.showComplete() ? items : items.filter((w) => w.status !== 'complete');
  });
}
