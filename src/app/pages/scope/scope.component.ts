import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PeopleService } from '../../core/people.service';
import { hasAnyRole } from '../../core/callings-vocabulary';
import { isBranchUnit, unitLabel } from '../../core/units';
import type { Person } from '../../models/types';

interface Slot {
  label: string;
  roles: string[];
  people: Person[];
}

interface UnitSection {
  name: string;
  isBranch: boolean;
  bishopric: Slot[];
  eq: Slot[]; // empty for branches
}

const PRES_SLOTS: Array<{ label: string; roles: string[] }> = [
  { label: 'President', roles: ['Stake President'] },
  { label: '1st Counselor', roles: ['Stake Presidency First Counselor'] },
  { label: '2nd Counselor', roles: ['Stake Presidency Second Counselor'] },
  { label: 'Executive Secretary', roles: ['Stake Executive Secretary'] },
  { label: 'Clerk', roles: ['Stake Clerk'] },
  {
    label: 'Assistant Clerk',
    roles: ['Stake Assistant Clerk', 'Stake Assistant Clerk--Finance', 'Stake Assistant Clerk--Membership'],
  },
];

const BISHOPRIC_SLOTS_WARD: Array<{ label: string; roles: string[] }> = [
  { label: 'Bishop', roles: ['Bishop'] },
  { label: '1st Counselor', roles: ['Bishopric First Counselor'] },
  { label: '2nd Counselor', roles: ['Bishopric Second Counselor'] },
  { label: 'Executive Secretary', roles: ['Ward Executive Secretary'] },
  { label: 'Assistant Exec Sec', roles: ['Ward Assistant Executive Secretary'] },
  { label: 'Clerk', roles: ['Ward Clerk'] },
  {
    label: 'Assistant Clerk',
    roles: ['Ward Assistant Clerk', 'Ward Assistant Clerk--Finance', 'Ward Assistant Clerk--Membership'],
  },
];

const BISHOPRIC_SLOTS_BRANCH: Array<{ label: string; roles: string[] }> = [
  { label: 'Branch President', roles: ['Branch President'] },
  { label: '1st Counselor', roles: ['Branch Presidency First Counselor'] },
  { label: '2nd Counselor', roles: ['Branch Presidency Second Counselor'] },
  { label: 'Executive Secretary', roles: ['Branch Executive Secretary'] },
  { label: 'Clerk', roles: ['Branch Clerk'] },
  {
    label: 'Assistant Clerk',
    roles: ['Branch Assistant Clerk', 'Branch Assistant Clerk--Finance', 'Branch Assistant Clerk--Membership'],
  },
];

const EQ_SLOTS: Array<{ label: string; roles: string[] }> = [
  { label: 'President', roles: ['Elders Quorum President'] },
  { label: '1st Counselor', roles: ['Elders Quorum First Counselor'] },
  { label: '2nd Counselor', roles: ['Elders Quorum Second Counselor'] },
  { label: 'Secretary', roles: ['Elders Quorum Secretary'] },
  { label: 'Assistant Secretary', roles: ['Elders Quorum Assistant Secretary'] },
];

const AUX_SPECS: Array<{ label: string; prefix: string }> = [
  { label: 'Young Women', prefix: 'Stake Young Women' },
  { label: 'Young Men', prefix: 'Stake Young Men' },
  { label: 'Primary', prefix: 'Stake Primary' },
  { label: 'Relief Society', prefix: 'Stake Relief Society' },
  { label: 'Sunday School', prefix: 'Stake Sunday School' },
];

const AUX_ROLE_SUFFIXES: Array<{ label: string; suffix: string }> = [
  { label: 'President', suffix: 'President' },
  { label: '1st Counselor', suffix: 'First Counselor' },
  { label: '2nd Counselor', suffix: 'Second Counselor' },
  { label: 'Secretary', suffix: 'Secretary' },
];

@Component({
  selector: 'app-scope',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="stack">
      <div class="row-between">
        <div>
          <h1 style="margin: 0">Stake Scope</h1>
          <p class="muted text-sm" style="margin: 0.25rem 0 0">
            Stake callings, ward bishoprics, and elders quorum presidencies. Updated live from the
            people collection.
          </p>
        </div>
        <div class="totals">
          <div class="total">
            <span class="num">{{ counts().stake }}</span>
            <span class="label">Stake</span>
          </div>
          <div class="total">
            <span class="num">{{ counts().bshp }}</span>
            <span class="label">Bishopric</span>
          </div>
          <div class="total">
            <span class="num">{{ counts().eq }}</span>
            <span class="label">EQ</span>
          </div>
        </div>
      </div>

      <input
        type="search"
        placeholder="Filter by name…"
        [ngModel]="filter()"
        (ngModelChange)="filter.set($event)"
      />

      @if (people().length === 0) {
        <p class="muted">
          No people with in-scope callings yet. Import from LCR on the
          <a routerLink="/people/import">Roster</a> page.
        </p>
      } @else {
        <!-- Stake Presidency & Office -->
        <div class="card stack">
          <div class="section-label">Stake Presidency &amp; Office</div>
          <dl class="slots">
            @for (slot of presidencySlots(); track slot.label) {
              <div class="slot">
                <dt>{{ slot.label }}</dt>
                <dd>
                  @if (slot.people.length === 0) {
                    <span class="gap">—</span>
                  } @else {
                    @for (p of slot.people; track p.id) {
                      <div class="person">
                        <span class="p-name">{{ p.name }}</span>
                        <span class="p-meta">{{ unitLabel(p.unit) }}</span>
                        @if (p.email) { <a class="p-mini" [attr.href]="'mailto:' + p.email">✉︎</a> }
                      </div>
                    }
                  }
                </dd>
              </div>
            }
          </dl>
        </div>

        <!-- High Council & Patriarch -->
        @if (highCouncil().length > 0 || patriarch()) {
          <div class="card stack">
            <div class="section-label">High Council &amp; Patriarch</div>
            <div class="hc-grid">
              @for (p of highCouncil(); track p.id) {
                <div class="hc-cell">
                  <div class="p-name">{{ p.name }}</div>
                  <div class="p-meta">{{ unitLabel(p.unit) }}</div>
                </div>
              }
            </div>
            @if (patriarch(); as pat) {
              <div class="patriarch">
                <span class="section-label" style="margin: 0">Patriarch</span>
                <span class="p-name">{{ pat.name }}</span>
                <span class="p-meta">{{ unitLabel(pat.unit) }}</span>
              </div>
            }
          </div>
        }

        <!-- Auxiliaries -->
        <div class="card stack">
          <div class="section-label">Stake Auxiliaries</div>
          <div class="aux-grid">
            @for (aux of auxiliaries(); track aux.name) {
              <div class="aux">
                <div class="aux-name">{{ aux.name }}</div>
                <dl class="slots">
                  @for (slot of aux.slots; track slot.label) {
                    <div class="slot">
                      <dt>{{ slot.label }}</dt>
                      <dd>
                        @if (slot.people.length === 0) {
                          <span class="gap">—</span>
                        } @else {
                          @for (p of slot.people; track p.id) {
                            <div class="person compact">
                              <span class="p-name">{{ p.name }}</span>
                              <span class="p-meta">{{ unitLabel(p.unit) }}</span>
                            </div>
                          }
                        }
                      </dd>
                    </div>
                  }
                </dl>
              </div>
            }
          </div>
        </div>

        <!-- Units -->
        @for (u of units(); track u.name) {
          <div class="card unit-card stack">
            <div class="unit-header">
              <span class="unit-name">{{ u.name }}</span>
              <span class="unit-kind">{{ u.isBranch ? 'branch' : 'ward' }}</span>
            </div>
            <div class="unit-body">
              <div class="unit-side">
                <div class="section-label">
                  {{ u.isBranch ? 'Branch Presidency' : 'Bishopric' }}
                </div>
                <dl class="slots">
                  @for (slot of u.bishopric; track slot.label) {
                    <div class="slot">
                      <dt>{{ slot.label }}</dt>
                      <dd>
                        @if (slot.people.length === 0) {
                          <span class="gap">—</span>
                        } @else {
                          @for (p of slot.people; track p.id) {
                            <div class="person compact">
                              <span class="p-name">{{ p.name }}</span>
                              @if (p.email) { <a class="p-mini" [attr.href]="'mailto:' + p.email">✉︎</a> }
                            </div>
                          }
                        }
                      </dd>
                    </div>
                  }
                </dl>
              </div>
              @if (!u.isBranch) {
                <div class="unit-side">
                  <div class="section-label">Elders Quorum</div>
                  <dl class="slots">
                    @for (slot of u.eq; track slot.label) {
                      <div class="slot">
                        <dt>{{ slot.label }}</dt>
                        <dd>
                          @if (slot.people.length === 0) {
                            <span class="gap">—</span>
                          } @else {
                            @for (p of slot.people; track p.id) {
                              <div class="person compact">
                                <span class="p-name">{{ p.name }}</span>
                                @if (p.email) { <a class="p-mini" [attr.href]="'mailto:' + p.email">✉︎</a> }
                              </div>
                            }
                          }
                        </dd>
                      </div>
                    }
                  </dl>
                </div>
              }
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: [
    `
      .totals {
        display: flex;
        gap: 1.25rem;
        align-items: baseline;
      }
      .total {
        display: flex;
        flex-direction: column;
        line-height: 1.05;
      }
      .total .num {
        font-size: 1.75rem;
        font-weight: 600;
        color: var(--primary);
        font-variant-numeric: tabular-nums;
      }
      .total .label {
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--muted);
      }
      .section-label {
        font-size: 0.72rem;
        font-weight: 600;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--accent);
      }
      dl.slots {
        margin: 0;
        display: flex;
        flex-direction: column;
      }
      dl.slots .slot {
        display: grid;
        grid-template-columns: 12rem 1fr;
        gap: 1rem;
        padding: 0.5rem 0;
        border-top: 1px solid var(--border);
      }
      dl.slots .slot:first-child { border-top: none; }
      dl.slots dt {
        font-size: 0.72rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--muted);
        margin: 0;
      }
      dl.slots dd {
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .person {
        display: flex;
        align-items: baseline;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .person.compact { gap: 0.35rem; }
      .p-name { font-weight: 500; color: var(--text); }
      .p-meta {
        font-size: 0.75rem;
        color: var(--muted);
        letter-spacing: 0.01em;
      }
      .p-mini {
        display: inline-flex;
        width: 1.4rem;
        height: 1.4rem;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        color: var(--muted);
        text-decoration: none;
        font-size: 0.85rem;
      }
      .p-mini:hover { background: var(--bg); color: var(--primary); }
      .gap {
        color: var(--warn);
        font-weight: 600;
      }

      .hc-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 0.5rem 1.25rem;
      }
      .hc-cell {
        padding: 0.35rem 0;
        border-top: 1px solid var(--border);
      }
      .hc-cell:nth-child(-n+3) { border-top: none; }

      .patriarch {
        margin-top: 0.5rem;
        padding: 0.6rem 0.9rem;
        border-radius: 8px;
        background: var(--bg);
        display: flex;
        align-items: baseline;
        gap: 0.75rem;
        flex-wrap: wrap;
      }

      .aux-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 1rem 1.5rem;
      }
      .aux .aux-name {
        font-weight: 600;
        color: var(--text);
        margin-bottom: 0.25rem;
      }
      .aux dl.slots .slot { grid-template-columns: 7rem 1fr; }

      .unit-card { padding-bottom: 1.25rem; }
      .unit-header {
        display: flex;
        align-items: baseline;
        gap: 0.75rem;
        padding-bottom: 0.75rem;
        border-bottom: 1px solid var(--border);
      }
      .unit-name {
        font-size: 1.15rem;
        font-weight: 600;
        color: var(--text);
      }
      .unit-kind {
        font-size: 0.68rem;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--muted);
      }
      .unit-body {
        display: grid;
        grid-template-columns: 1fr;
        gap: 1.5rem;
      }
      @media (min-width: 720px) {
        .unit-body { grid-template-columns: 1fr 1fr; gap: 2rem; }
        .unit-side dl.slots .slot { grid-template-columns: 8.5rem 1fr; }
      }
      .text-sm { font-size: 0.85rem; }
      input[type='search'] {
        padding: 0.6rem 0.7rem;
        border-radius: 8px;
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--text);
      }
    `,
  ],
})
export class ScopeComponent {
  private readonly peopleService = inject(PeopleService);
  private readonly allPeople = toSignal(this.peopleService.list(), { initialValue: [] as Person[] });

  protected readonly filter = signal('');
  protected readonly unitLabel = unitLabel;

  /** People with at least one in-scope calling AND matching the filter. */
  protected readonly people = computed(() => {
    const term = this.filter().trim().toLowerCase();
    return this.allPeople().filter((p) => {
      if (!p.callings || p.callings.length === 0) return false;
      if (!term) return true;
      return p.name.toLowerCase().includes(term);
    });
  });

  protected readonly counts = computed(() => {
    const ppl = this.people();
    const stake = ppl.filter((p) =>
      p.callings?.some((c) => c === 'Patriarch' || c.startsWith('Stake ')),
    ).length;
    const bshp = ppl.filter((p) =>
      p.callings?.some(
        (c) =>
          c.startsWith('Bishopric') ||
          c === 'Bishop' ||
          c.startsWith('Ward ') ||
          c.startsWith('Branch '),
      ),
    ).length;
    const eq = ppl.filter((p) => p.callings?.some((c) => c.startsWith('Elders Quorum'))).length;
    return { stake, bshp, eq };
  });

  protected readonly presidencySlots = computed<Slot[]>(() =>
    PRES_SLOTS.map((s) => ({
      label: s.label,
      roles: s.roles,
      people: this.people().filter((p) => hasAnyRole(p.callings, s.roles)),
    })),
  );

  protected readonly highCouncil = computed(() =>
    this.people()
      .filter((p) => hasAnyRole(p.callings, ['Stake High Councilor']))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  protected readonly patriarch = computed<Person | null>(() => {
    const match = this.people().find((p) => hasAnyRole(p.callings, ['Patriarch']));
    return match ?? null;
  });

  protected readonly auxiliaries = computed(() =>
    AUX_SPECS.map((aux) => ({
      name: aux.label,
      slots: AUX_ROLE_SUFFIXES.map((role) => ({
        label: role.label,
        roles: [`${aux.prefix} ${role.suffix}`],
        people: this.people().filter((p) =>
          hasAnyRole(p.callings, [`${aux.prefix} ${role.suffix}`]),
        ),
      })),
    })),
  );

  protected readonly units = computed<UnitSection[]>(() => {
    const ppl = this.people();
    // Group by unit id (the stable Church unit number stored on each Person).
    const unitIds = [...new Set(ppl.map((p) => p.unit))];
    const out: UnitSection[] = [];
    for (const unitId of unitIds) {
      const isBranch = isBranchUnit(unitId);
      const bshpSpecs = isBranch ? BISHOPRIC_SLOTS_BRANCH : BISHOPRIC_SLOTS_WARD;
      const bishopric: Slot[] = bshpSpecs.map((s) => ({
        label: s.label,
        roles: s.roles,
        people: ppl.filter((p) => p.unit === unitId && hasAnyRole(p.callings, s.roles)),
      }));
      const eq: Slot[] = isBranch
        ? []
        : EQ_SLOTS.map((s) => ({
            label: s.label,
            roles: s.roles,
            people: ppl.filter((p) => p.unit === unitId && hasAnyRole(p.callings, s.roles)),
          }));
      // Only include the unit if it has at least one person in scope.
      if (bishopric.some((s) => s.people.length > 0) || eq.some((s) => s.people.length > 0)) {
        out.push({ name: unitLabel(unitId), isBranch, bishopric, eq });
      }
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  });
}
