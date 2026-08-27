import { Component, inject } from '@angular/core';
import { AuthService } from '../core/auth.service';
// Type-only: importing the class itself would pull the demo chunk into
// the initial bundle, which is exactly what main.ts avoids.
import type { DemoAuthService } from '../core/demo/demo-auth.service';
import { demoMode, exitDemoMode } from '../core/demo/demo-mode';
import { ALL_ROLES, type Role } from '../models/types';

/**
 * Abbreviated role names for the banner's switch. The full labels don't
 * fit beside the warning text on a phone, and the app header directly
 * below already spells the current role out in full.
 */
const SHORT_ROLE_LABELS: Record<Role, string> = {
  stake_presidency: 'Presidency',
  high_council: 'High Council',
};

/**
 * Always-visible marker that the data on screen is fake. A stake tool
 * showing invented names and callings has to say so unmistakably - the
 * cost of someone acting on demo data is far higher than the cost of a
 * strip of screen real estate.
 *
 * Also carries the role switch. The presidency and the high council see
 * materially different UI (who may create workflows, who votes on high
 * council approval), and flipping the pretend user's role is the only way
 * to exercise both paths without two real accounts.
 */
@Component({
  selector: 'app-demo-banner',
  standalone: true,
  template: `
    @if (demoMode) {
      <div class="demo-banner" role="status">
        <span class="demo-tag">Demo</span>
        <!-- A phone can't fit the full sentence alongside the controls, and
             the controls are what make demo mode testable. The short form
             plus the DEMO tag still says the only thing that matters. -->
        <span class="demo-text demo-text-long">Sample data — nothing here is real</span>
        <span class="demo-text demo-text-short">Not real data</span>
        <label class="demo-role">
          <span class="sr-only">Demo role</span>
          <select
            [value]="currentRole()"
            (change)="onRoleChange($event)"
            aria-label="Demo role"
          >
            @for (role of roles; track role) {
              <option [value]="role">{{ shortRoleLabels[role] }}</option>
            }
          </select>
        </label>
        <button type="button" class="demo-exit" (click)="exit()">Exit</button>
      </div>
    }
  `,
})
export class DemoBannerComponent {
  protected readonly demoMode = demoMode;
  protected readonly roles = ALL_ROLES;
  protected readonly shortRoleLabels = SHORT_ROLE_LABELS;

  // In demo mode the AuthService token resolves to DemoAuthService (see
  // app.config.ts). Outside demo mode this component renders nothing, so
  // the cast is only ever exercised where it holds.
  private readonly authService = inject(AuthService, { optional: true }) as DemoAuthService | null;

  protected currentRole(): Role {
    return this.authService?.appUser()?.role ?? 'stake_presidency';
  }

  protected onRoleChange(event: Event): void {
    const role = (event.target as HTMLSelectElement).value as Role;
    this.authService?.setRole(role);
  }

  protected exit(): void {
    exitDemoMode();
  }
}
