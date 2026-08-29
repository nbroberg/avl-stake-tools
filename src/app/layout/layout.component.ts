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
        <a class="app-brand" routerLink="/">Stake Presidency Tools</a>
        <!-- On a phone the identity wraps to its own line under the brand;
             on wider screens it sits inline. See .app-identity in styles.css. -->
        @if (authService.appUser(); as user) {
          <span class="app-identity text-sm">
            {{ user.displayName }} &middot; {{ roleLabels[user.role] }}
          </span>
        }
        <button class="btn app-signout" (click)="signOut()">Sign out</button>
      </header>
      <nav class="app-nav" aria-label="Primary">
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }"
          >Dashboard</a
        >
        <a routerLink="/callings" routerLinkActive="active">Callings</a>
        <a routerLink="/sunday-visit" routerLinkActive="active">Sunday Visit</a>
        <a routerLink="/advancements" routerLinkActive="active">Advancements</a>
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
