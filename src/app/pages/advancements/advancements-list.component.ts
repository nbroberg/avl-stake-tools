import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { PriesthoodAdvancementsService } from '../../core/priesthood-advancements.service';
import { PAGE_INCREMENT, estimateInitialPageSize } from '../../core/page-size';
import { canCreateWorkflow } from '../../core/roles';
import { workflowScopeLabel } from '../../core/units';
import { awaitsResponseFrom } from '../../core/advancement-review';
import { AuthService } from '../../core/auth.service';
import { LoadMoreSentinelDirective } from '../../shared/load-more-sentinel.directive';
import { StatusBadgeComponent } from '../../shared/status-badge.component';

// Rough height of a `.list-item` card (title + subtitle line, plus margin).
const ROW_HEIGHT_PX = 84;
import {
  ADVANCEMENT_STATUS_LABELS,
  ADVANCEMENT_TYPE_LABELS,
  type PriesthoodAdvancementWorkflow,
} from '../../models/types';

@Component({
  selector: 'app-advancements-list',
  standalone: true,
  imports: [FormsModule, RouterLink, StatusBadgeComponent, LoadMoreSentinelDirective],
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
        <h1 style="margin: 0">Priesthood Advancements</h1>
        @if (canCreateWorkflow(authService.appUser())) {
          <a class="btn btn-primary btn-row-action" routerLink="/advancements/new">+ New</a>
        }
      </div>

      @if (awaitingCount() > 0) {
        <div class="awaiting-banner">
          <strong>
            {{ awaitingCount() }}
            {{ awaitingCount() === 1 ? 'proposal awaits' : 'proposals await' }} your response
          </strong>
          <button type="button" class="btn btn-sm" (click)="onlyAwaiting.set(!onlyAwaiting())">
            {{ onlyAwaiting() ? 'Show all' : 'Show only these' }}
          </button>
        </div>
      }

      <label class="row text-sm muted" style="gap: 0.5rem; min-height: var(--tap)">
        <input type="checkbox" [ngModel]="showComplete()" (ngModelChange)="showComplete.set($event)" />
        Show completed
      </label>

      @if (workflows() === null) {
        <p class="muted">Loading…</p>
      } @else {
        @if (visible().length === 0) {
          <p class="muted">
            {{ onlyAwaiting() ? 'Nothing is waiting on you right now.' : 'No advancements yet.' }}
          </p>
        }

        <div class="stack">
          @for (w of visible(); track w.id) {
            <a class="list-item" [routerLink]="['/advancements', w.id]">
              <div class="row-between">
                <div style="min-width: 0">
                  <strong>{{ typeLabels[w.advancementType] }}</strong>
                  <div class="muted text-sm">
                    {{ w.personName }} &middot; {{ workflowScopeLabel(w.unit) }}
                  </div>
                  @if (awaitsMe(w)) {
                    <span class="awaiting-pill">Awaiting your response</span>
                  }
                </div>
                <app-status-badge [status]="w.status" [label]="statusLabels[w.status] ?? w.status" />
              </div>
            </a>
          }
        </div>

        @if (!reachedEnd()) {
          <!-- Scrolling this into view - whether by the user reaching the
               bottom, or because a filter left too little content to fill
               the screen - means there may be more to load. -->
          <div appLoadMoreSentinel (visible)="loadMore()" style="height: 1px"></div>
        }
      }
    </div>
  `,
})
export class AdvancementsListComponent {
  protected readonly authService = inject(AuthService);
  protected readonly canCreateWorkflow = canCreateWorkflow;
  protected readonly workflowScopeLabel = workflowScopeLabel;
  protected readonly typeLabels = ADVANCEMENT_TYPE_LABELS;
  // Cast to a string-indexed record - see advancement-detail.component.ts.
  protected readonly statusLabels = ADVANCEMENT_STATUS_LABELS as Record<string, string>;
  protected readonly showComplete = signal(false);
  protected readonly onlyAwaiting = signal(false);

  private readonly advancementsService = inject(PriesthoodAdvancementsService);
  protected readonly pageSize = signal(estimateInitialPageSize(ROW_HEIGHT_PX));
  protected readonly workflows = toSignal(
    toObservable(this.pageSize).pipe(
      switchMap((limit) => this.advancementsService.listWorkflows({ limit })),
    ),
    { initialValue: null },
  );

  /** Firestore returned fewer docs than asked for, so there's nothing more to page in. */
  protected readonly reachedEnd = computed(() => (this.workflows()?.length ?? 0) < this.pageSize());

  protected loadMore(): void {
    if (!this.reachedEnd()) this.pageSize.update((n) => n + PAGE_INCREMENT);
  }

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

  protected awaitsMe(w: PriesthoodAdvancementWorkflow): boolean {
    return awaitsResponseFrom(w, this.authService.appUser());
  }
}
