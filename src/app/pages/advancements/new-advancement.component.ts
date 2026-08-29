import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PriesthoodAdvancementsService } from '../../core/priesthood-advancements.service';
import { PeopleService } from '../../core/people.service';
import { AuthService } from '../../core/auth.service';
import { unitLabel } from '../../core/units';
import {
  ADVANCEMENT_OFFICES,
  ADVANCEMENT_TYPE_LABELS,
  type PriesthoodAdvancementType,
} from '../../models/types';

const ADVANCEMENT_TYPES: PriesthoodAdvancementType[] = ['priest_to_elder', 'elder_to_high_priest'];

@Component({
  selector: 'app-new-advancement',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="stack">
      <h1>New Priesthood Advancement</h1>
      <form class="stack card" (ngSubmit)="submit()">
        <div class="field">
          <label>Advancement</label>
          <select
            [ngModel]="advancementType()"
            (ngModelChange)="advancementType.set($event)"
            name="advancementType"
          >
            @for (t of advancementTypes; track t) {
              <option [value]="t">{{ typeLabels[t] }}</option>
            }
          </select>
          <span class="text-sm muted">
            Requires the office of <strong>{{ fromOffice() }}</strong> on record.
          </span>
        </div>

        <div class="field">
          <label>Person</label>
          @if (eligiblePeople().length > 0) {
            <div class="candidate-list" role="radiogroup" aria-label="Select the person to advance">
              @for (p of eligiblePeople(); track p.id) {
                <label class="candidate" [class.selected]="personId() === p.id">
                  <input
                    type="radio"
                    name="personId"
                    [value]="p.id"
                    [checked]="personId() === p.id"
                    (change)="personId.set(p.id)"
                    required
                  />
                  <span class="candidate-body">
                    <span class="candidate-name">{{ p.name }}</span>
                    <span class="candidate-meta">{{ unitLabel(p.unit) }} &middot; {{ p.priesthoodOffice }}</span>
                  </span>
                </label>
              }
            </div>
          } @else {
            <span class="text-sm muted">
              No one in the roster is currently on record as {{ fromOffice() }}.
            </span>
          }
        </div>

        <div class="field">
          <label>Notes (optional)</label>
          <textarea [ngModel]="notes()" (ngModelChange)="notes.set($event)" name="notes"></textarea>
        </div>

        @if (error(); as e) {
          <p class="text-danger text-sm">{{ e }}</p>
        }

        <button class="btn btn-primary btn-responsive" type="submit" [disabled]="saving() || !personId()">
          {{ saving() ? 'Saving…' : 'Propose' }}
        </button>
      </form>
    </div>
  `,
  styles: [
    `
      .candidate-list {
        display: flex;
        flex-direction: column;
        max-height: min(24rem, 60dvh);
        overflow-y: auto;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--surface);
      }
      .candidate {
        display: grid;
        grid-template-columns: auto 1fr;
        align-items: start;
        gap: 0.7rem;
        padding: 0.85rem 0.75rem;
        min-height: var(--tap);
        flex-shrink: 0;
        border-top: 1px solid rgba(26, 39, 51, 0.14);
        cursor: pointer;
        touch-action: manipulation;
        transition: background-color 120ms ease;
      }
      .candidate:first-child { border-top: none; }
      @media (hover: hover) {
        .candidate:hover { background: var(--bg); }
      }
      .candidate:active { background: var(--bg); }
      .candidate.selected {
        background: var(--bg);
        box-shadow: inset 3px 0 0 var(--primary);
      }
      .candidate input[type='radio'] { margin-top: 0.15rem; }
      .candidate-body {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        min-width: 0;
      }
      .candidate-name {
        font-weight: 500;
        color: var(--text);
        line-height: 1.3;
      }
      .candidate-meta {
        font-size: 0.75rem;
        color: var(--muted);
        line-height: 1.3;
      }
    `,
  ],
})
export class NewAdvancementComponent {
  private readonly authService = inject(AuthService);
  private readonly advancementsService = inject(PriesthoodAdvancementsService);
  private readonly peopleService = inject(PeopleService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly advancementTypes = ADVANCEMENT_TYPES;
  protected readonly typeLabels = ADVANCEMENT_TYPE_LABELS;
  protected readonly unitLabel = unitLabel;
  protected readonly people = toSignal(this.peopleService.list(), { initialValue: [] });

  protected readonly advancementType = signal<PriesthoodAdvancementType>('priest_to_elder');
  protected readonly personId = signal('');
  protected readonly notes = signal('');

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** The office a candidate must currently hold for the selected advancement. */
  protected readonly fromOffice = computed(() => ADVANCEMENT_OFFICES[this.advancementType()].from);

  /** People on record with the required starting office, alphabetized. */
  protected readonly eligiblePeople = computed(() => {
    const from = this.fromOffice().toLowerCase();
    return this.people()
      .filter((p) => (p.priesthoodOffice ?? '').trim().toLowerCase() === from)
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  constructor() {
    // Prefill from query params when the form is reached via a
    // "Start an advancement" link, e.g. from the priesthood-ordination
    // banner on a calling's detail page: ?type=elder_to_high_priest&
    // personId=… arrives with the type and candidate already known.
    const qp = this.route.snapshot.queryParamMap;
    const qpType = qp.get('type');
    if (qpType === 'priest_to_elder' || qpType === 'elder_to_high_priest') {
      this.advancementType.set(qpType);
    }
    const qpPerson = qp.get('personId');
    if (qpPerson) this.personId.set(qpPerson);

    // Changing the advancement type can invalidate the selected person
    // (they no longer hold the required starting office for the new
    // type) - clear the selection rather than silently submitting a
    // stale personId. Skip the very first pass so the query-param
    // prefill above isn't wiped before the roster snapshot loads
    // (eligiblePeople starts empty).
    let firstPass = true;
    effect(() => {
      const id = this.personId();
      const candidates = this.eligiblePeople();
      if (firstPass) {
        firstPass = false;
        return;
      }
      if (!id) return;
      if (!candidates.some((p) => p.id === id)) {
        this.personId.set('');
      }
    });
  }

  async submit(): Promise<void> {
    const actor = this.authService.appUser();
    const person = this.people().find((p) => p.id === this.personId());
    if (!actor || !person) return;

    this.saving.set(true);
    this.error.set(null);
    try {
      const notes = this.notes().trim();
      const id = await this.advancementsService.create(
        {
          advancementType: this.advancementType(),
          personId: person.id,
          personName: person.name,
          unit: person.unit,
          ...(notes ? { notes } : {}),
        },
        actor,
      );
      void this.router.navigate(['/advancements', id]);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to create workflow.');
    } finally {
      this.saving.set(false);
    }
  }
}
