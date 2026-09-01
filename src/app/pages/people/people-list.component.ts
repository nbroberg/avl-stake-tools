import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { switchMap } from 'rxjs';
import { PeopleService } from '../../core/people.service';
import { PAGE_INCREMENT, estimateInitialPageSize } from '../../core/page-size';
import { unitLabel } from '../../core/units';
import { LoadMoreSentinelDirective } from '../../shared/load-more-sentinel.directive';

// The stacked-card layout below 640px is much taller per row than the
// desktop table, so a mobile screenful holds far fewer people.
const ROW_HEIGHT_STACKED_PX = 140;
const ROW_HEIGHT_TABLE_PX = 44;

@Component({
  selector: 'app-people-list',
  standalone: true,
  imports: [FormsModule, LoadMoreSentinelDirective],
  template: `
    <div class="stack">
      <div class="row-between">
        <h1 style="margin: 0">Roster</h1>
      </div>

      <input
        type="search"
        aria-label="Filter roster by name"
        placeholder="Filter by name…"
        autocapitalize="none"
        autocomplete="off"
        [ngModel]="filter()"
        (ngModelChange)="filter.set($event)"
      />

      <p class="muted text-sm">
        Only the fields needed for scheduling and calling workflows are kept here - name, unit,
        email, phone. This is not a copy of the membership record.
      </p>

      <div class="card card-flush-sm">
        <div class="table-wrap">
          <!-- The stacked class turns each row into a labelled card below
               640px; the data-label on every cell supplies the field names. -->
          <table class="stacked">
            <thead>
              <tr>
                <th>Name</th>
                <th>Unit</th>
                <th>Email</th>
                <th>Phone</th>
              </tr>
            </thead>
            <tbody>
              @for (p of visible(); track p.id) {
                <tr>
                  <td data-label="Name">{{ p.name }}</td>
                  <td data-label="Unit">{{ unitLabel(p.unit) }}</td>
                  <td data-label="Email" class="muted">
                    @if (p.email) {
                      <a [href]="'mailto:' + p.email">{{ p.email }}</a>
                    } @else {
                      —
                    }
                  </td>
                  <td data-label="Phone" class="muted">
                    <!-- Tappable on a phone; the roster's main use away from a
                         desk is reaching someone. -->
                    @if (p.phone) {
                      <a [href]="'tel:' + p.phone">{{ p.phone }}</a>
                    } @else {
                      —
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (visible().length === 0) {
          <p class="muted">No people yet.</p>
        }
        @if (!reachedEnd()) {
          <!-- Scrolling this into view - whether by the user reaching the
               bottom, or because a filter left too little content to fill
               the screen - means there may be more to load. -->
          <div appLoadMoreSentinel (visible)="loadMore()" style="height: 1px"></div>
        }
      </div>
    </div>
  `,
})
export class PeopleListComponent {
  private readonly peopleService = inject(PeopleService);
  protected readonly unitLabel = unitLabel;

  protected readonly pageSize = signal(
    estimateInitialPageSize(
      typeof window !== 'undefined' && window.innerWidth < 640
        ? ROW_HEIGHT_STACKED_PX
        : ROW_HEIGHT_TABLE_PX,
    ),
  );

  protected readonly people = toSignal(
    toObservable(this.pageSize).pipe(switchMap((n) => this.peopleService.list(n))),
    { initialValue: [] },
  );

  /** Firestore returned fewer docs than asked for, so there's nothing more to page in. */
  protected readonly reachedEnd = computed(() => this.people().length < this.pageSize());

  protected readonly filter = signal('');

  protected readonly visible = computed(() => {
    const q = this.filter().toLowerCase();
    return this.people().filter((p) => p.name.toLowerCase().includes(q));
  });

  protected loadMore(): void {
    if (!this.reachedEnd()) this.pageSize.update((n) => n + PAGE_INCREMENT);
  }
}
