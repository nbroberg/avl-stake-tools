import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CallingsService } from '../../core/callings.service';
import { PeopleService } from '../../core/people.service';
import { AuthService } from '../../core/auth.service';
import {
  STAKE_ROLE_GROUPS,
  WARD_BISHOPRIC_ROLES,
  BRANCH_PRESIDENCY_ROLES,
  EQ_ROLES,
  unitScopeFor,
} from '../../core/callings-vocabulary';
import { STAKE_UNITS, unitLabel } from '../../core/units';
import type { CallingWorkflowType } from '../../models/types';

interface CallingOptionGroup {
  label: string;
  options: readonly string[];
}

const CALLING_GROUPS: CallingOptionGroup[] = [
  // Stake callings are LCR-categorized so the dropdown has one optgroup
  // per stake-org section rather than one 100+-item block.
  ...STAKE_ROLE_GROUPS.map((g) => ({ label: g.label, options: g.roles })),
  { label: 'Ward Bishopric', options: WARD_BISHOPRIC_ROLES },
  { label: 'Branch Presidency', options: BRANCH_PRESIDENCY_ROLES },
  { label: 'Elders Quorum Presidency', options: EQ_ROLES },
];

@Component({
  selector: 'app-new-calling',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="stack">
      <h1>New {{ workflowType() === 'release' ? 'Release' : 'Calling' }}</h1>
      <form class="stack card" (ngSubmit)="submit()">
        <div class="field">
          <label>Type</label>
          <select
            [ngModel]="workflowType()"
            (ngModelChange)="workflowType.set($event)"
            name="workflowType"
          >
            <option value="calling">New Calling</option>
            <option value="release">Release</option>
          </select>
        </div>

        <div class="field">
          <label>Person</label>
          <select
            [ngModel]="personId()"
            (ngModelChange)="personId.set($event)"
            name="personId"
            required
          >
            <option value="" disabled>Select a person…</option>
            @for (p of people(); track p.id) {
              <option [value]="p.id">{{ p.name }} ({{ unitLabel(p.unit) }})</option>
            }
          </select>
          <span class="text-sm muted">
            Don't see them? Add via <a routerLink="/people">Roster</a> first.
          </span>
        </div>

        <div class="field">
          <label>Calling name</label>
          <select
            [ngModel]="callingName()"
            (ngModelChange)="callingName.set($event)"
            name="callingName"
            required
          >
            <option value="" disabled>Select a calling…</option>
            @for (group of callingGroups; track group.label) {
              <optgroup [label]="group.label">
                @for (opt of group.options; track opt) {
                  <option [value]="opt">{{ opt }}</option>
                }
              </optgroup>
            }
          </select>
        </div>

        @if (unitScope() === 'none') {
          <p class="muted text-sm" style="margin: 0">
            This is a stake-level calling; no ward or branch to select.
          </p>
        } @else {
          <div class="field">
            <label>Unit</label>
            <select
              [ngModel]="unit()"
              (ngModelChange)="unit.set($event)"
              name="unit"
              required
            >
              <option value="" disabled>Select a {{ unitScope() }}…</option>
              @for (u of availableUnits(); track u.number) {
                <option [value]="u.number">{{ u.name }}</option>
              }
            </select>
          </div>
        }

        <div class="field">
          <label>Notes (optional)</label>
          <textarea
            [ngModel]="notes()"
            (ngModelChange)="notes.set($event)"
            name="notes"
          ></textarea>
        </div>

        @if (error(); as e) {
          <p class="text-danger text-sm">{{ e }}</p>
        }

        <button class="btn btn-primary" type="submit" [disabled]="saving()">
          {{ saving() ? 'Saving…' : 'Create' }}
        </button>
      </form>
    </div>
  `,
})
export class NewCallingComponent {
  private readonly authService = inject(AuthService);
  private readonly callingsService = inject(CallingsService);
  private readonly peopleService = inject(PeopleService);
  private readonly router = inject(Router);

  protected readonly callingGroups = CALLING_GROUPS;
  protected readonly unitLabel = unitLabel;
  protected readonly people = toSignal(this.peopleService.list(), { initialValue: [] });

  /** Which kind of unit the currently-selected calling needs, if any. */
  protected readonly unitScope = computed(() => unitScopeFor(this.callingName()));
  /** Unit dropdown, filtered to just the wards or branches for this calling. */
  protected readonly availableUnits = computed(() => {
    const scope = this.unitScope();
    if (scope === 'none') return [];
    return STAKE_UNITS.filter((u) => u.kind === scope);
  });

  protected readonly workflowType = signal<CallingWorkflowType>('calling');
  protected readonly personId = signal('');
  protected readonly callingName = signal('');
  protected readonly unit = signal('');
  protected readonly notes = signal('');

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  async submit(): Promise<void> {
    const actor = this.authService.appUser();
    const person = this.people().find((p) => p.id === this.personId());
    if (!actor || !person || !this.callingName()) return;
    // Only require a unit when the calling actually needs one (stake-level
    // callings don't - the Unit field is hidden in that case).
    if (this.unitScope() !== 'none' && !this.unit()) return;

    this.saving.set(true);
    this.error.set(null);
    try {
      const notes = this.notes().trim();
      const unitId = this.unitScope() === 'none' ? undefined : this.unit();
      const id = await this.callingsService.create(
        {
          workflowType: this.workflowType(),
          personId: person.id,
          personName: person.name,
          callingName: this.callingName(),
          ...(unitId ? { unit: unitId } : {}),
          ...(notes ? { notes } : {}),
        },
        actor,
      );
      void this.router.navigate(['/callings', id]);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to create workflow.');
    } finally {
      this.saving.set(false);
    }
  }
}
