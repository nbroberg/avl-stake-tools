import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="stack">
      <h1 style="margin-bottom: 0">
        Welcome{{ authService.appUser() ? ', ' + authService.appUser()!.displayName : '' }}
      </h1>
      <p class="muted">Pick a workflow to get started.</p>

      <div class="stack">
        <a class="list-item" routerLink="/callings">
          <strong>Callings &amp; Sustainings</strong>
          <div class="muted text-sm">Track proposed callings and releases through completion.</div>
        </a>
        <a class="list-item" routerLink="/people">
          <strong>Roster</strong>
          <div class="muted text-sm">Import from LCR and browse local Person records.</div>
        </a>
        <a class="list-item" routerLink="/diagnostics">
          <strong>Diagnostics</strong>
          <div class="muted text-sm">Check Firebase Auth and Firestore connectivity.</div>
        </a>
      </div>
    </div>
  `,
})
export class DashboardComponent {
  protected readonly authService = inject(AuthService);
}
