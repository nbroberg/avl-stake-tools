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
        This never connects to LCR - it only parses text you've already copied. Only people with
        an in-scope calling (stake, bishopric or branch presidency, elders quorum presidency) are
        kept; other rows are counted and skipped.
      </p>
      <p class="muted text-sm">
        Your LCR custom report must include these columns:
        <strong>Preferred Name</strong>, <strong>Unit</strong>, <strong>Callings</strong>,
        <strong>Membership Number</strong>. E-mail and phone are optional but recommended.
        The MRN is used as the stable identity key, so re-importing updates the same records
        rather than creating duplicates.
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

      <button class="btn" (click)="doParse()" [disabled]="!raw().trim()">Parse</button>

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
              Review {{ result.rows.length }} in-scope row(s) &middot;
              {{ selectedCount() }} selected
              @if (result.skippedOutOfScope > 0) {
                <span class="muted text-sm">
                  &middot; {{ result.skippedOutOfScope }} skipped (no in-scope calling)
                </span>
              }
            </strong>
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>MRN</th>
                  <th>Name</th>
                  <th>Unit</th>
                  <th>In-scope callings</th>
                  <th>Email</th>
                </tr>
              </thead>
              <tbody>
                @for (row of result.rows; track row.mrn) {
                  <tr>
                    <td>
                      <input
                        type="checkbox"
                        [checked]="selected().has(row.mrn)"
                        (change)="toggle(row.mrn)"
                      />
                    </td>
                    <td class="muted text-sm">{{ row.mrn }}</td>
                    <td>{{ row.name }}</td>
                    <td>{{ row.unitName }}</td>
                    <td class="text-sm">{{ row.callings.join(' · ') }}</td>
                    <td class="muted text-sm">{{ row.email ?? '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
            <button
              class="btn btn-primary"
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
})
export class RosterImportComponent {
  private readonly peopleService = inject(PeopleService);
  private readonly router = inject(Router);

  protected readonly raw = signal('');
  protected readonly parseResult = signal<LcrParseResult | null>(null);
  protected readonly selected = signal<Set<string>>(new Set());
  protected readonly saving = signal(false);

  protected readonly selectedCount = computed(() => this.selected().size);

  doParse(): void {
    const result = parseLcrRoster(this.raw());
    this.parseResult.set(result);
    // Default: all in-scope rows selected.
    this.selected.set(new Set(result.rows.map((r) => r.mrn)));
  }

  toggle(mrn: string): void {
    this.selected.update((prev) => {
      const next = new Set(prev);
      if (next.has(mrn)) next.delete(mrn);
      else next.add(mrn);
      return next;
    });
  }

  async doImport(): Promise<void> {
    const result = this.parseResult();
    if (!result) return;
    this.saving.set(true);
    try {
      const chosen = result.rows.filter((r) => this.selected().has(r.mrn));
      for (const r of chosen) {
        await this.peopleService.upsertByMrn({
          mrn: r.mrn,
          name: r.name,
          unit: r.unit,
          email: r.email,
          phone: r.phone,
          callings: r.callings,
        });
      }
      void this.router.navigateByUrl('/people');
    } finally {
      this.saving.set(false);
    }
  }
}
