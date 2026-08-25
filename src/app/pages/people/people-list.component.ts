import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PeopleService } from '../../core/people.service';
import { AuthService } from '../../core/auth.service';
import { canManageRoster } from '../../core/roles';
import { unitLabel } from '../../core/units';

@Component({
  selector: 'app-people-list',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="stack">
      <div class="row-between">
        <h1 style="margin: 0">Roster</h1>
        @if (canManageRoster(authService.appUser())) {
          <a class="btn btn-primary" routerLink="/people/import">Import from LCR</a>
        }
      </div>

      <input
        placeholder="Filter by name…"
        [ngModel]="filter()"
        (ngModelChange)="filter.set($event)"
      />

      <p class="muted text-sm">
        Only the fields needed for scheduling and calling workflows are kept here - name, unit,
        email, phone. This is not a copy of the membership record.
      </p>

      <div class="card">
        <table>
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
                <td>{{ p.name }}</td>
                <td>{{ unitLabel(p.unit) }}</td>
                <td class="muted">{{ p.email ?? '—' }}</td>
                <td class="muted">{{ p.phone ?? '—' }}</td>
              </tr>
            }
          </tbody>
        </table>
        @if (visible().length === 0) {
          <p class="muted">No people yet.</p>
        }
      </div>
    </div>
  `,
})
export class PeopleListComponent {
  private readonly peopleService = inject(PeopleService);
  protected readonly authService = inject(AuthService);
  protected readonly canManageRoster = canManageRoster;
  protected readonly unitLabel = unitLabel;
  protected readonly people = toSignal(this.peopleService.list(), { initialValue: [] });

  protected readonly filter = signal('');

  protected readonly visible = computed(() => {
    const q = this.filter().toLowerCase();
    return this.people().filter((p) => p.name.toLowerCase().includes(q));
  });
}
