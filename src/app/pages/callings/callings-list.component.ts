import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { switchMap, tap } from 'rxjs';
import { CallingsService } from '../../core/callings.service';
import { estimateInitialPageSize } from '../../core/page-size';
import { canCreateWorkflow } from '../../core/roles';
import { unitLabel, workflowScopeLabel } from '../../core/units';
import { callingAwaitsResponseFrom } from '../../core/hc-vote';
import { AuthService } from '../../core/auth.service';
import { LoadMoreSentinelDirective } from '../../shared/load-more-sentinel.directive';
import { StatusBadgeComponent } from '../../shared/status-badge.component';

// Rough height of a `.list-item` card (title + subtitle line, plus margin).
const ROW_HEIGHT_PX = 84;
// Smaller than core/page-size's default increment - this collection is a
// handful of in-flight workflows plus history, not a whole membership
// roster, so a big batch would swallow the rest of it in one hop and make
// the paging invisible.
const PAGE_INCREMENT = 8;
import {
  CALLING_STATUS_LABELS,
  RELEASE_STATUS_LABELS,
  type CallingWorkflow,
} from '../../models/types';

/**
 * Same label CALLING_STATUS_LABELS/RELEASE_STATUS_LABELS would give,
 * except `recorded_in_lcr` reads as "Awaiting setting apart" - see
 * calling-detail.component.ts's displayStatusLabel for why that literal
 * always means fully sustained + recorded + not yet set apart.
 */
function labelFor(w: CallingWorkflow): string {
  if (w.status === 'recorded_in_lcr') return 'Awaiting setting apart';
  const labels = w.workflowType === 'release' ? RELEASE_STATUS_LABELS : CALLING_STATUS_LABELS;
  return (labels as Record<string, string>)[w.status] ?? w.status;
}

@Component({
  selector: 'app-callings-list',
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
        background: var(--row-highlight);
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
      /* Two side-by-side selects on a phone, each free to wrap to its own
         line once the labels no longer fit. */
      .filters {
        display: flex;
        flex-wrap: wrap;
        gap: 0.6rem;
      }
      .filters .field {
        flex: 1 1 10rem;
      }
      /* Whole-card shading so a calling vs. a release reads at a glance,
         not just from the small text label in the subtitle line. */
      .list-item.type-calling {
        background: color-mix(in srgb, var(--primary) 6%, var(--surface));
        border-left: 4px solid var(--primary);
      }
      .list-item.type-release {
        background: color-mix(in srgb, var(--release) 8%, var(--surface));
        border-left: 4px solid var(--release);
      }
    `,
  ],
  template: `
    <div class="stack">
      <div class="row-between">
        <h1 style="margin: 0">Callings &amp; Releases</h1>
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

      <div class="filters">
        <div class="field">
          <label for="type-filter">Type</label>
          <select
            id="type-filter"
            [ngModel]="typeFilter()"
            (ngModelChange)="typeFilter.set($event)"
          >
            <option value="all">Callings &amp; releases</option>
            <option value="calling">Callings only</option>
            <option value="release">Releases only</option>
          </select>
        </div>
        <div class="field">
          <label for="unit-filter">Unit</label>
          <select
            id="unit-filter"
            [ngModel]="unitFilter()"
            (ngModelChange)="unitFilter.set($event)"
          >
            <option value="all">All units</option>
            @for (u of unitOptions(); track u.value) {
              <option [value]="u.value">{{ u.label }}</option>
            }
          </select>
        </div>
      </div>

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
            @if (onlyAwaiting()) {
              Nothing is waiting on you right now.
            } @else if (filtersActive()) {
              Nothing matches these filters.
            } @else {
              No workflows yet.
            }
          </p>
        }

        <div class="stack">
          @for (w of visible(); track w.id) {
            <a class="list-item type-{{ w.workflowType }}" [routerLink]="['/callings', w.id]">
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
export class CallingsListComponent {
  protected readonly authService = inject(AuthService);
  protected readonly canCreateWorkflow = canCreateWorkflow;
  protected readonly labelFor = labelFor;
  protected readonly workflowScopeLabel = workflowScopeLabel;
  protected readonly showComplete = signal(false);
  protected readonly onlyAwaiting = signal(false);
  protected readonly typeFilter = signal<'all' | CallingWorkflow['workflowType']>('all');
  /** 'all', 'stake' (workflows with no unit), or a unit number. */
  protected readonly unitFilter = signal<string>('all');

  private readonly callingsService = inject(CallingsService);
  protected readonly pageSize = signal(estimateInitialPageSize(ROW_HEIGHT_PX));
  protected readonly workflows = toSignal(
    toObservable(this.pageSize).pipe(
      switchMap((limit) =>
        this.callingsService
          .listWorkflows({ limit })
          .pipe(tap(() => this.loadingMore.set(false))),
      ),
    ),
    { initialValue: null },
  );

  /** Firestore returned fewer docs than asked for, so there's nothing more to page in. */
  protected readonly reachedEnd = computed(() => (this.workflows()?.length ?? 0) < this.pageSize());

  /**
   * Guards against the load-more sentinel re-firing before the previous
   * bump has rendered. The sentinel's IntersectionObserver doesn't only
   * fire on the transition into view - it can fire again whenever the
   * sentinel's position shifts while still visible, which happens on every
   * bump as new rows push it further down. Without this guard, a burst of
   * those firings before Firestore responds would each bump the page size,
   * cascading straight to the whole collection instead of one page at a
   * time.
   */
  protected readonly loadingMore = signal(false);

  protected loadMore(): void {
    if (this.reachedEnd() || this.loadingMore()) return;
    this.loadingMore.set(true);
    this.pageSize.update((n) => n + PAGE_INCREMENT);
  }

  /** Workflows this signed-in high councilor still owes a response. */
  protected readonly awaitingMine = computed(() => {
    const user = this.authService.appUser();
    return (this.workflows() ?? []).filter((w) => callingAwaitsResponseFrom(w, user));
  });

  protected readonly awaitingCount = computed(() => this.awaitingMine().length);

  /**
   * Unit choices, derived from the workflows actually loaded rather than
   * from the whole stakeUnits() vocabulary, so the dropdown never offers a
   * unit that would filter the list to nothing. "Stake" leads because a
   * stake-level workflow is the one with no unit at all.
   */
  protected readonly unitOptions = computed(() => {
    const seen = new Set<string>();
    for (const w of this.workflows() ?? []) seen.add(w.unit ?? '');
    const units = [...seen]
      .filter(Boolean)
      .map((n) => ({ value: n, label: unitLabel(n) }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return seen.has('') ? [{ value: 'stake', label: 'Stake' }, ...units] : units;
  });

  protected readonly filtersActive = computed(
    () => this.typeFilter() !== 'all' || this.unitFilter() !== 'all',
  );

  protected readonly visible = computed(() => {
    const items = this.workflows();
    if (!items) return [];
    const base = this.onlyAwaiting()
      ? this.awaitingMine()
      : this.showComplete()
        ? items
        : items.filter((w) => w.status !== 'complete');
    const type = this.typeFilter();
    const unit = this.unitFilter();
    if (type === 'all' && unit === 'all') return base;
    return base.filter((w) => {
      if (type !== 'all' && w.workflowType !== type) return false;
      if (unit === 'stake') return !w.unit;
      if (unit !== 'all') return w.unit === unit;
      return true;
    });
  });

  protected awaitsMe(w: CallingWorkflow): boolean {
    return callingAwaitsResponseFrom(w, this.authService.appUser());
  }
}
