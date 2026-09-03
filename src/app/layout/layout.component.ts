import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { ROLE_LABELS } from '../models/types';

/** Types that bring up the iOS text keyboard - not checkbox/radio/etc. */
const TEXT_INPUT_TYPES = new Set([
  'text',
  'search',
  'email',
  'tel',
  'url',
  'number',
  'password',
]);

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="app-shell" (focusin)="onFocusChange()" (focusout)="onFocusChange()">
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
      <nav class="app-nav" [class.keyboard-active]="keyboardActive()" aria-label="Primary">
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }"
          >Dashboard</a
        >
        <a routerLink="/units" routerLinkActive="active">Units</a>
        <a routerLink="/assignments" routerLinkActive="active">Assignments</a>
        <a routerLink="/callings" routerLinkActive="active">Callings</a>
        <a routerLink="/advancements" routerLinkActive="active">Advancements</a>
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

  /**
   * Whether a text field is focused, so the fixed bottom nav can hide
   * itself while the on-screen keyboard is up - see the `.keyboard-active`
   * rule in styles.css for why.
   */
  protected readonly keyboardActive = signal(false);

  /**
   * `focusout` fires before the next element's `focusin` completes, so
   * checking synchronously would flicker the nav off and back on every
   * time focus moves between two text fields. Deferring lets the new
   * focus settle first.
   */
  protected onFocusChange(): void {
    setTimeout(() => {
      const el = document.activeElement;
      this.keyboardActive.set(
        el instanceof HTMLTextAreaElement ||
          (el instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(el.type)),
      );
    });
  }

  signOut(): void {
    void this.authService.signOut();
  }
}
