import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { parseLcrRoster, type LcrParseResult } from '../../core/lcr-parser';
import { PeopleService } from '../../core/people.service';

@Component({
  selector: 'app-roster-import',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="stack">
      <h1>Import from LCR</h1>
      <p class="muted text-sm">
        Open the callings custom report in LCR, copy the rows you need, and paste them below.
        This never connects to LCR - it only parses text you've already copied. Everyone in the
        paste is imported; only the calling shown against them is filtered down to stake,
        bishopric/branch presidency, or elders quorum presidency roles, since those are the only
        ones this app tracks.
      </p>
      <p class="muted text-sm">
        Your LCR custom report must include: <strong>Full Name</strong>,
        <strong>Birth Year</strong>, <strong>Unit</strong>, <strong>Callings</strong> (or
        <strong>Callings with Date Sustained</strong> to also capture time-in-calling).
        <strong>Preferred Name</strong> is used for display if present (falls back to Full Name).
        <strong>Individual E-mail</strong> and <strong>Individual Phone</strong> are optional.
        Person records are keyed by Full Name + Birth Year, so re-importing updates the same
        records rather than creating duplicates.
      </p>

      <div class="field">
        <label>Pasted roster text</label>
        <textarea
          [ngModel]="raw()"
          (ngModelChange)="raw.set($event)"
          rows="10"
          placeholder="Paste the header row plus the roster rows here…"
        ></textarea>
      </div>

      <button class="btn btn-responsive" (click)="doParse()" [disabled]="!raw().trim()">
        Parse
      </button>

      @if (parseResult(); as result) {
        @if (result.errors.length > 0) {
          <div class="card stack">
            <strong class="text-danger">Errors</strong>
            <ul class="text-sm">
              @for (e of result.errors; track $index) {
                <li>Line {{ e.line }}: {{ e.message }}</li>
              }
            </ul>
          </div>
        }

        @if (result.rows.length > 0) {
          <div class="card stack">
            <strong>
              Review {{ result.rows.length }} row(s) &middot;
              {{ selectedCount() }} selected
              @if (result.withoutTrackedCalling > 0) {
                <span class="muted text-sm">
                  &middot; {{ result.withoutTrackedCalling }} with no in-scope calling
                </span>
              }
            </strong>
            @if (!hasPriesthoodOfficeColumn()) {
              <p class="text-sm muted" style="margin: 0">
                Heads up: this paste doesn't include the <strong>Priesthood office</strong>
                column. Re-run the LCR custom report with that column added so the workflow
                can flag mismatches (e.g. calling an Elder to be Bishop).
              </p>
            }
            <!-- Seven columns never fit a phone: the stacked class breaks each
                 row into its own labelled card below 640px, and table-wrap lets
                 the table scroll on its own above that instead of the page. -->
            <div class="table-wrap">
              <table class="stacked">
                <thead>
                  <tr>
                    <th><span class="sr-only">Include</span></th>
                    <th>Name</th>
                    <th>Born</th>
                    <th>Unit</th>
                    <th>Office</th>
                    <th>In-scope callings</th>
                    <th>Email</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of result.rows; track row.id) {
                    <tr>
                      <td class="pick-cell">
                        <!-- The label wraps the checkbox so the person's name is
                             part of the tap target, not just the 20px box. -->
                        <label class="pick">
                          <input
                            type="checkbox"
                            [checked]="selected().has(row.id)"
                            (change)="toggle(row.id)"
                          />
                          <span class="pick-text">Include in import</span>
                        </label>
                      </td>
                      <td data-label="Name">
                        <div>{{ row.displayName }}</div>
                        @if (row.displayName !== row.fullName) {
                          <div class="muted text-sm">{{ row.fullName }}</div>
                        }
                      </td>
                      <td data-label="Born" class="muted text-sm">{{ row.birthYear }}</td>
                      <td data-label="Unit">{{ row.unitName }}</td>
                      <td data-label="Office" class="muted text-sm">
                        @if (row.priesthoodOffice === undefined) {
                          <span>—</span>
                        } @else if (row.priesthoodOffice === '') {
                          <span>(none)</span>
                        } @else {
                          <span>{{ row.priesthoodOffice }}</span>
                        }
                      </td>
                      <td data-label="Callings" class="text-sm">
                        @for (c of row.callings; track c; let last = $last) {
                          <span>{{ c }}</span>
                          @if (row.sustainedAt[c]) {
                            <span class="muted"> ({{ row.sustainedAt[c] }})</span>
                          }
                          @if (!last) { <span> · </span> }
                        }
                      </td>
                      <td data-label="Email" class="muted text-sm">{{ row.email ?? '—' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <button
              class="btn btn-primary btn-responsive"
              [disabled]="saving() || selectedCount() === 0"
              (click)="doImport()"
            >
              {{ saving() ? 'Importing…' : 'Import ' + selectedCount() + ' selected' }}
            </button>
          </div>
        }
      }
    </div>
  `,
  styles: [
    `
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
      .pick {
        display: inline-flex;
        align-items: center;
        gap: 0.6rem;
        /* Vertical padding brings the row's tap target up to ~44px. */
        padding: 0.35rem 0;
        min-height: var(--tap);
        cursor: pointer;
      }
      /* On wide screens the checkbox is a bare column - the name is already in
         the next cell, so the repeated label would be noise. */
      .pick-text { display: none; }
      @media (max-width: 639.98px) {
        .pick-cell {
          border-bottom: 1px solid var(--border);
          margin-bottom: 0.35rem;
        }
        .pick { min-height: 0; }
        .pick-text { display: inline; font-size: 0.9rem; font-weight: 600; }
        /* The stacked layout right-aligns cell values; this cell is a control,
           so keep it reading left-to-right. */
        .pick-cell > * { text-align: left; }
      }
    `,
  ],
})
export class RosterImportComponent {
  private readonly peopleService = inject(PeopleService);
  private readonly router = inject(Router);

  protected readonly raw = signal('');
  protected readonly parseResult = signal<LcrParseResult | null>(null);
  protected readonly selected = signal<Set<string>>(new Set());
  protected readonly saving = signal(false);

  protected readonly selectedCount = computed(() => this.selected().size);

  /** True when at least one parsed row saw a Priesthood office cell
   *  (populated or empty). Distinguishes "the column was in the paste
   *  and this person happens to have no office" from "the column
   *  wasn't in the paste at all". */
  protected readonly hasPriesthoodOfficeColumn = computed(() => {
    const rows = this.parseResult()?.rows ?? [];
    return rows.some((r) => r.priesthoodOffice !== undefined);
  });

  doParse(): void {
    const result = parseLcrRoster(this.raw());
    this.parseResult.set(result);
    // Default: every parsed row selected.
    this.selected.set(new Set(result.rows.map((r) => r.id)));
  }

  toggle(id: string): void {
    this.selected.update((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async doImport(): Promise<void> {
    const result = this.parseResult();
    if (!result) return;
    this.saving.set(true);
    try {
      const chosen = result.rows.filter((r) => this.selected().has(r.id));
      for (const r of chosen) {
        await this.peopleService.upsertPerson({
          id: r.id,
          name: r.displayName,
          fullName: r.fullName,
          birthYear: r.birthYear,
          unit: r.unit,
          email: r.email,
          phone: r.phone,
          priesthoodOffice: r.priesthoodOffice,
          callings: r.callings,
          sustainedAt: Object.keys(r.sustainedAt).length ? r.sustainedAt : undefined,
        });
      }
      void this.router.navigateByUrl('/people');
    } finally {
      this.saving.set(false);
    }
  }
}
