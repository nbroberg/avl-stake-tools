import { Component, computed, effect, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
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
import {
  PRIESTHOOD_REQUIREMENT_LABELS,
  eligibleCallees,
  hasAnyCalling,
  isSingletonCalling,
  priesthoodRequirementFor,
  requiresExistingCalling,
} from '../../core/calling-authorities';
import { stakeUnits, unitLabel } from '../../core/units';
import type { CallingWorkflowType, Person } from '../../models/types';

interface CallingOptionGroup {
  label: string;
  options: readonly string[];
}

interface CallingDropdownGroup {
  label: string;
  options: Array<{ name: string; holderCount?: number }>;
}

/** Candidates shown in the person picker once there's a search query. */
const RESULTS_LIMIT = 8;

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
          <label>Calling name</label>
          <select
            [ngModel]="callingName()"
            (ngModelChange)="callingName.set($event)"
            name="callingName"
            required
          >
            <option value="" disabled>
              {{ workflowType() === 'release' ? 'Select a filled calling…' : 'Select a calling…' }}
            </option>
            @for (group of displayedCallingGroups(); track group.label) {
              <optgroup [label]="group.label">
                @for (opt of group.options; track opt.name) {
                  <option [value]="opt.name">
                    {{ opt.name
                    }}{{ opt.holderCount ? ' — ' + opt.holderCount + ' holder' + (opt.holderCount === 1 ? '' : 's') : '' }}
                  </option>
                }
              </optgroup>
            }
          </select>
          @if (workflowType() === 'release' && displayedCallingGroups().length === 0) {
            <span class="text-sm muted">
              No in-scope callings are filled in the current roster. Import from
              <a routerLink="/people">Roster</a> first, or switch to New Calling.
            </span>
          } @else if (workflowType() === 'calling' && callingName() && priesthoodLabel(); as label) {
            <span class="text-sm muted">
              Priesthood-office requirement: <strong>{{ label }}</strong>.
            </span>
          }
        </div>

        @if (workflowType() === 'calling') {
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
                <option value="" disabled>Select a {{ unitPlaceholder() }}…</option>
                @for (u of availableUnits(); track u.number) {
                  <option [value]="u.number">{{ u.name }}</option>
                }
              </select>
              <span class="text-sm muted">
                Person list will show only members of this {{ unitPlaceholder() }}.
              </span>
            </div>
          }
        }

        @if (
          workflowType() === 'calling' &&
          swapCandidates().length > 0
        ) {
          <div class="card swap-notice">
            <strong>Currently held —</strong>
            <span class="text-sm" style="margin-left: 0.35rem">
              {{ callingName() }} is a single-seat position and someone already holds it.
              Start a release in a new tab so you can run both workflows side-by-side.
            </span>
            <ul class="swap-list">
              @for (h of swapCandidates(); track h.id) {
                <li>
                  <span class="p-name">{{ h.name }}</span>
                  <span class="p-meta">({{ unitLabel(h.unit) }})</span>
                  <a
                    class="btn btn-secondary btn-sm"
                    [href]="releaseUrl(h.id)"
                    target="_blank"
                    rel="noopener"
                  >
                    Release {{ h.name }} ↗
                  </a>
                </li>
              }
            </ul>
          </div>
        }

        @if (
          workflowType() === 'calling' && callingName() && requiresExistingCalling(callingName())
        ) {
          <!-- These callings are usually extended to someone already
               serving elsewhere, so the candidate list defaults to that -
               this is the escape hatch for the rare legitimate exception. -->
          <label class="row text-sm muted" style="gap: 0.5rem; min-height: var(--tap)">
            <input
              type="checkbox"
              [ngModel]="includeNoCurrentCalling()"
              (ngModelChange)="includeNoCurrentCalling.set($event)"
              name="includeNoCurrentCalling"
            />
            Include people with no current calling
          </label>
        }

        <div class="field">
          <label>
            {{ workflowType() === 'release' ? 'Person to release' : 'Person' }}
          </label>
          @if (displayedCandidates().length > 0) {
            <input
              type="search"
              [ngModel]="personQuery()"
              (ngModelChange)="personQuery.set($event)"
              name="personQuery"
              placeholder="Search by name…"
              aria-label="Search candidates by name"
            />
          }
          @if (searchedCandidates().length > 0) {
            <div
              class="candidate-list"
              role="radiogroup"
              [attr.aria-label]="
                workflowType() === 'release'
                  ? 'Select the person to release from this calling'
                  : 'Select the person for this calling'
              "
            >
              @for (p of searchedCandidates(); track p.id) {
                <label
                  class="candidate"
                  [class.selected]="personId() === p.id"
                >
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
                    @if (p.callings && p.callings.length > 0) {
                      <span class="candidate-callings">
                        @for (c of p.callings; track c; let last = $last) {
                          <span
                            [class.highlight]="
                              workflowType() === 'release' && c === callingName()
                            "
                          >{{ c }}</span>
                          @if (!last) { <span class="sep"> · </span> }
                        }
                      </span>
                    } @else if (p.allCallings && p.allCallings.length > 0) {
                      <!-- Not the tracked vocabulary, so no highlight matching -
                           just informational, e.g. Primary Teacher, Ward Missionary. -->
                      <span class="candidate-callings">
                        @for (c of p.allCallings; track c; let last = $last) {
                          <span>{{ c }}</span>
                          @if (!last) { <span class="sep"> · </span> }
                        }
                      </span>
                    } @else {
                      <span class="candidate-callings muted">No calling on record</span>
                    }
                    <span class="candidate-meta">
                      {{ unitLabel(p.unit)
                      }}{{ p.priesthoodOffice ? ' · ' + p.priesthoodOffice : '' }}
                    </span>
                  </span>
                </label>
              }
            </div>
            @if (matchedCandidates().length > searchedCandidates().length) {
              <span class="text-sm muted">
                Showing the first {{ searchedCandidates().length }} matches — refine your search
                to narrow further.
              </span>
            }
          } @else if (displayedCandidates().length > 0 && personQuery().trim()) {
            <span class="text-sm muted">
              No one matches "{{ personQuery().trim() }}".
            </span>
          } @else if (displayedCandidates().length > 0) {
            <span class="text-sm muted">Start typing a name to search.</span>
          }
          @if (workflowType() === 'release') {
            @if (callingName() && displayedCandidates().length === 0) {
              <span class="text-sm muted">
                No one in the roster is currently listed as {{ callingName() }}.
                Re-import the roster or pick a different calling.
              </span>
            } @else if (!callingName()) {
              <span class="text-sm muted">
                Pick a calling above to see its current holder(s).
              </span>
            }
          } @else {
            @if (callingName() && displayedCandidates().length === 0) {
              <span class="text-sm muted">
                No one in the roster matches the filters for this calling.
                @if (unitScope() !== 'none' && !unit()) {
                  Pick a {{ unitPlaceholder() }} above to narrow the list.
                } @else {
                  Import from <a routerLink="/people">Roster</a> with the LCR "Priesthood office"
                  column included, or pick a different calling{{
                    unitScope() !== 'none' ? '/' + unitPlaceholder() : ''
                  }}.
                }
              </span>
            } @else if (callingName() && filteredOutCount() > 0) {
              <span class="text-sm muted">
                Filtered by {{ filterReasons() }} — {{ filteredOutCount() }} other
                {{ filteredOutCount() === 1 ? 'person' : 'people' }} in the roster don't qualify.
              </span>
            } @else {
              <span class="text-sm muted">
                Don't see them? Add via <a routerLink="/people">Roster</a> first.
              </span>
            }
          }
        </div>


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

        <button class="btn btn-primary btn-responsive" type="submit" [disabled]="saving()">
          {{ saving() ? 'Saving…' : 'Create' }}
        </button>
      </form>
    </div>
  `,
  styles: [
    `
      .candidate-list {
        /* No internal scroll here - a capped-height, independently
           scrolling list nested inside the page's own scroll reads as
           two competing scrollbars on mobile. The list grows to its full
           natural height instead, so the one scroll gesture that moves
           the page also moves through the candidates. */
        display: flex;
        flex-direction: column;
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
        /* The whole row is the tap target for the radio inside it. */
        min-height: var(--tap);
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
      .candidate-callings {
        font-size: 0.85rem;
        color: var(--text);
        line-height: 1.4;
      }
      .candidate-callings.muted { color: var(--muted); font-style: italic; }
      .candidate-callings .sep { color: var(--muted); }
      .candidate-callings .highlight {
        font-weight: 600;
        color: var(--primary);
      }
      .swap-notice {
        border-left: 3px solid var(--accent);
      }
      .swap-list {
        margin: 0.4rem 0 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }
      .swap-list li {
        display: flex;
        align-items: center;
        gap: 0.35rem 0.6rem;
        flex-wrap: wrap;
      }
      @media (max-width: 639.98px) {
        .swap-list li .btn { width: 100%; margin-top: 0.15rem; }
      }
      .swap-list .p-name { font-weight: 500; }
      .swap-list .p-meta { font-size: 0.85rem; color: var(--muted); }
      /* Compact chrome, but still a full-height target for a fingertip. */
      .btn-sm { padding: 0.25rem 0.7rem; font-size: 0.85rem; }
      .candidate-meta {
        font-size: 0.75rem;
        color: var(--muted);
        line-height: 1.3;
      }
    `,
  ],
})
export class NewCallingComponent {
  private readonly authService = inject(AuthService);
  private readonly callingsService = inject(CallingsService);
  private readonly peopleService = inject(PeopleService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly callingGroups = CALLING_GROUPS;
  protected readonly unitLabel = unitLabel;
  protected readonly requiresExistingCalling = requiresExistingCalling;

  protected readonly workflowType = signal<CallingWorkflowType>('calling');

  /**
   * Everyone who currently holds at least one in-scope calling, anywhere
   * in the stake - PeopleService.listWithCalling, a small fraction of
   * the roster. Deliberately NOT unit-restricted, even though the form
   * usually targets one ward: a shared calling name like "Bishop" or
   * "Ward Clerk" exists in every ward, and the swap notice below needs
   * to catch whoever currently holds THAT NAME anywhere, not just in
   * the ward being staffed. This is the whole data source Release mode
   * needs, and also feeds Calling mode's "already held" warning.
   */
  private readonly peopleWithCalling = toSignal(this.peopleService.listWithCalling(), {
    initialValue: [],
  });

  /**
   * Candidate pool for Calling mode, unit-restricted when a unit is
   * picked. Only `unit` is a safe exact-match field to push to
   * Firestore - priesthoodOffice is free-text from a pasted LCR export
   * and matched case-insensitively client-side (see
   * calling-authorities.ts), so an exact-match Firestore filter on it
   * risks silently dropping real candidates over a casing difference.
   * Narrowing to the unit alone is still a real win for ward/branch/EQ
   * callings, without that risk. Irrelevant in Release mode, which
   * sources candidates from currentHoldings/peopleWithCalling instead -
   * a new calling candidate often holds nothing yet, so this can't be
   * limited to peopleWithCalling the way Release mode is.
   */
  private readonly candidateQuery = computed((): { kind: 'unit'; unit: string } | { kind: 'all' } => {
    const scope = this.unitScope();
    const unit = this.unit();
    if (scope !== 'none' && unit) return { kind: 'unit', unit };
    return { kind: 'all' };
  });

  private readonly candidatePool = toSignal(
    toObservable(this.candidateQuery).pipe(
      switchMap((q) =>
        q.kind === 'unit' ? this.peopleService.listByUnit(q.unit) : this.peopleService.list(),
      ),
    ),
    { initialValue: [] },
  );

  /** All (calling → holders) pairs derived from peopleWithCalling. Powers
   *  the release-mode calling dropdown ("only show filled callings"),
   *  the release-mode person list ("only the current holders"), and
   *  Calling mode's "already held" swap notice. */
  private readonly currentHoldings = computed(() => {
    const map = new Map<string, Person[]>();
    for (const p of this.peopleWithCalling()) {
      for (const c of p.callings ?? []) {
        const arr = map.get(c);
        if (arr) arr.push(p);
        else map.set(c, [p]);
      }
    }
    return map;
  });

  /** People who satisfy the calling's priesthood requirement - the unit
   *  constraint doesn't need re-checking here, since candidatePool is
   *  already restricted to the selected unit whenever one applies (see
   *  candidateQuery) - AND already hold some other calling (see
   *  requiresExistingCalling), unless the override toggle is on. */
  protected readonly eligiblePeople = computed(() => {
    const name = this.callingName();
    if (!name) return this.candidatePool();
    const byPriesthood = eligibleCallees(name, this.candidatePool());
    if (!requiresExistingCalling(name) || this.includeNoCurrentCalling()) return byPriesthood;
    return byPriesthood.filter(hasAnyCalling);
  });

  /** How many people got dropped by the current filter set, for the
   *  "N other people don't qualify" hint. */
  protected readonly filteredOutCount = computed(
    () => this.candidatePool().length - this.eligiblePeople().length,
  );

  /** Eligible people alphabetized by display name for the candidate list. */
  protected readonly sortedEligiblePeople = computed(() =>
    [...this.eligiblePeople()].sort((a, b) => a.name.localeCompare(b.name)),
  );

  /** Current holders of the selected calling — release-mode candidates. */
  protected readonly releaseCandidates = computed(() => {
    const name = this.callingName();
    if (!name) return [];
    return [...(this.currentHoldings().get(name) ?? [])].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  });

  /** In Calling mode: current holder(s) of a singleton calling — someone
   *  who would need to be released before this new person is set apart.
   *  Empty for multi-holder callings (auditor, high councilor, specialist)
   *  and for empty seats, so the swap card only appears when there's
   *  actually a swap to do. */
  protected readonly swapCandidates = computed(() => {
    const name = this.callingName();
    if (!name || !isSingletonCalling(name)) return [];
    return this.releaseCandidates();
  });

  /** Href for the "Release X" link — opens the New Calling form in
   *  release mode with the calling and person pre-selected. */
  releaseUrl(personId: string): string {
    const params = new URLSearchParams({
      type: 'release',
      calling: this.callingName(),
      personId,
    });
    return `${this.router.serializeUrl(
      this.router.createUrlTree(['/callings/new']),
    )}?${params.toString()}`;
  }

  /** The person list shown in the current mode — new candidates when
   *  Type is Calling, current holders when Type is Release. */
  protected readonly displayedCandidates = computed(() =>
    this.workflowType() === 'release'
      ? this.releaseCandidates()
      : this.sortedEligiblePeople(),
  );

  protected readonly personQuery = signal('');

  /** displayedCandidates narrowed by the name search box. Nothing shows
   *  until there's a query - for a unit or stake-wide calling that list
   *  can run long, and making the search a precondition instead of a
   *  refinement keeps the page from rendering everyone by default. Search
   *  never affects eligibility - only what's iterated in the template -
   *  so a selected person stays selected even if a later search hides
   *  their row. */
  protected readonly matchedCandidates = computed(() => {
    const q = this.personQuery().trim().toLowerCase();
    if (!q) return [];
    return this.displayedCandidates().filter((p) => p.name.toLowerCase().includes(q));
  });

  /** matchedCandidates capped to the first RESULTS_LIMIT - see RESULTS_LIMIT. */
  protected readonly searchedCandidates = computed(() =>
    this.matchedCandidates().slice(0, RESULTS_LIMIT),
  );

  /** Calling dropdown options in the current mode. For a release, we
   *  hide every calling nobody in the roster holds — you can't release
   *  from an empty position. Each option carries a holderCount for the
   *  "— N holders" tail-label. */
  protected readonly displayedCallingGroups = computed<CallingDropdownGroup[]>(() => {
    const holdings = this.currentHoldings();
    if (this.workflowType() === 'release') {
      return CALLING_GROUPS.map((g) => ({
        label: g.label,
        options: g.options
          .filter((c) => holdings.has(c))
          .map((c) => ({ name: c, holderCount: holdings.get(c)!.length })),
      })).filter((g) => g.options.length > 0);
    }
    return CALLING_GROUPS.map((g) => ({
      label: g.label,
      options: g.options.map((c) => ({ name: c })),
    }));
  });

  /** Which filters are currently narrowing the person list — used in
   *  the hint sentence beneath the dropdown. */
  protected readonly filterReasons = computed(() => {
    const name = this.callingName();
    const parts: string[] = [];
    if (name && priesthoodRequirementFor(name) !== 'none') {
      parts.push('priesthood-office requirement');
    }
    if (this.unitScope() !== 'none' && this.unit()) {
      parts.push('unit');
    }
    if (name && requiresExistingCalling(name) && !this.includeNoCurrentCalling()) {
      parts.push('having a current calling');
    }
    return parts.length > 0 ? parts.join(' and ') : 'no filters';
  });

  /** Human-readable priesthood-office requirement for the current
   *  calling. Returns null when the calling has no restriction. */
  protected readonly priesthoodLabel = computed(() => {
    const name = this.callingName();
    if (!name) return null;
    const req = priesthoodRequirementFor(name);
    if (req === 'none') return null;
    return PRIESTHOOD_REQUIREMENT_LABELS[req];
  });

  /** Which kind of unit the currently-selected calling needs, if any. */
  protected readonly unitScope = computed(() => unitScopeFor(this.callingName()));
  /** Unit dropdown, narrowed by the calling's scope. */
  protected readonly availableUnits = computed(() => {
    const scope = this.unitScope();
    if (scope === 'none') return [];
    if (scope === 'ward_or_branch') return [...stakeUnits()];
    return stakeUnits().filter((u) => u.kind === scope);
  });
  /** Placeholder text for the Unit dropdown. */
  protected readonly unitPlaceholder = computed(() => {
    const scope = this.unitScope();
    if (scope === 'ward_or_branch') return 'ward or branch';
    if (scope === 'ward') return 'ward';
    if (scope === 'branch') return 'branch';
    return 'unit';
  });

  protected readonly personId = signal('');
  protected readonly callingName = signal('');
  protected readonly unit = signal('');
  protected readonly notes = signal('');
  /** Overrides requiresExistingCalling's default - see eligiblePeople. */
  protected readonly includeNoCurrentCalling = signal(false);

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    // Prefill from query params when the form is reached via a
    // "Release X" link: ?type=release&calling=…&personId=… lets a New
    // Calling tab spin off a release in a new tab with the incumbent
    // already selected.
    const qp = this.route.snapshot.queryParamMap;
    const qpType = qp.get('type');
    if (qpType === 'release' || qpType === 'calling') {
      this.workflowType.set(qpType);
    }
    const qpCalling = qp.get('calling');
    if (qpCalling) this.callingName.set(qpCalling);
    const qpPerson = qp.get('personId');
    if (qpPerson) this.personId.set(qpPerson);

    // Clear the selected person whenever the mode-appropriate candidate
    // list no longer contains them: calling → changed calling / unit made
    // them ineligible, release → the current holders shifted. Skip the
    // very first pass so a query-param prefill isn't wiped before the
    // roster snapshot loads (`displayedCandidates` starts empty).
    let firstPass = true;
    effect(() => {
      const id = this.personId();
      const candidates = this.displayedCandidates();
      if (firstPass) {
        firstPass = false;
        return;
      }
      if (!id) return;
      if (!candidates.some((p) => p.id === id)) {
        this.personId.set('');
      }
    });
    // Switching from Release → Calling (or back) also invalidates the
    // calling name if the new mode doesn't offer it (e.g. previously
    // picked "Stake Clerk" for release, then switched to calling — the
    // name is still valid; but Release → New Calling with a name that
    // wasn't in the release list means no change needed. Left in place;
    // the person-clearing effect handles the person side either way).
  }

  async submit(): Promise<void> {
    const actor = this.authService.appUser();
    // The selected person came from candidatePool (Calling mode) or
    // peopleWithCalling (Release mode) depending on workflowType - check
    // whichever is relevant rather than re-deriving mode-branching logic
    // here.
    const person =
      this.candidatePool().find((p) => p.id === this.personId()) ??
      this.peopleWithCalling().find((p) => p.id === this.personId());
    if (!actor || !person || !this.callingName()) return;
    // Unit is only prompted for in Calling mode; on Release we derive it
    // from the person we're releasing (whose unit is authoritative for
    // ward/branch/EQ callings and irrelevant for stake ones).
    const isRelease = this.workflowType() === 'release';
    if (!isRelease && this.unitScope() !== 'none' && !this.unit()) return;

    this.saving.set(true);
    this.error.set(null);
    try {
      const notes = this.notes().trim();
      const unitId =
        this.unitScope() === 'none'
          ? undefined
          : isRelease
            ? person.unit
            : this.unit();
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
