import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { PeopleService } from '../../core/people.service';
import { unitLabel } from '../../core/units';

@Component({
  selector: 'app-people-list',
  standalone: true,
  imports: [FormsModule],
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
      </div>
    </div>
  `,
})
export class PeopleListComponent {
  private readonly peopleService = inject(PeopleService);
  protected readonly unitLabel = unitLabel;
  protected readonly people = toSignal(this.peopleService.list(), { initialValue: [] });

  protected readonly filter = signal('');

  protected readonly visible = computed(() => {
    const q = this.filter().toLowerCase();
    return this.people().filter((p) => p.name.toLowerCase().includes(q));
  });
}
