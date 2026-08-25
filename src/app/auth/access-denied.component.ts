import { Component, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-access-denied',
  standalone: true,
  template: `
    <div class="center-screen">
      <div class="card stack" style="max-width: 420px; width: 100%; text-align: center">
        <h1 style="margin: 0; font-size: 1.3rem">Access not yet granted</h1>
        <p class="muted text-sm">
          You're signed in as <strong>{{ authService.firebaseUser()?.email }}</strong
          >, but this account has not been approved for the Stake Presidency Tools app. Signing
          in with a Google account only proves who you are - a stake administrator still needs to
          add your account with an appropriate role before you can see any data.
        </p>
        <p class="muted text-sm">Ask your Stake Clerk or Admin to add your email in the app's user list.</p>
        <button class="btn" (click)="signOut()">Sign out</button>
      </div>
    </div>
  `,
})
export class AccessDeniedComponent {
  protected readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  constructor() {
    // If an admin approves this account while the tab stays open, the
    // Firestore listener in AuthService will flip status automatically -
    // follow it into the app rather than leaving the person stuck here.
    effect(() => {
      if (this.authService.status() === 'authorized') void this.router.navigateByUrl('/');
    });
  }

  signOut(): void {
    void this.authService.signOut();
  }
}
