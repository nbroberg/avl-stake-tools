import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { ROLE_LABELS } from '../models/types';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="app-shell">
      <header class="app-header">
        <a routerLink="/">Stake Presidency Tools</a>
        <div class="row" style="gap: 0.75rem">
          @if (authService.appUser(); as user) {
            <span class="text-sm" style="opacity: 0.9">
              {{ user.displayName }} &middot; {{ roleLabels[user.role] }}
            </span>
          }
          <button class="btn" (click)="signOut()">Sign out</button>
        </div>
      </header>
      <nav class="app-nav">
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }"
          >Dashboard</a
        >
        <a routerLink="/callings" routerLinkActive="active">Callings</a>
        <a routerLink="/scope" routerLinkActive="active">Scope</a>
        <a routerLink="/people" routerLinkActive="active">Roster</a>
        <a routerLink="/diagnostics" routerLinkActive="active">Diagnostics</a>
      </nav>
      <main class="app-main">
        <div class="page">
          <router-outlet />
        </div>
      </main>
    </div>
  `,
})
export class LayoutComponent {
  protected readonly authService = inject(AuthService);
  protected readonly roleLabels = ROLE_LABELS;

  signOut(): void {
    void this.authService.signOut();
  }
}
