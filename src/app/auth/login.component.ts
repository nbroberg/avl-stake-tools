import { Component, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  template: `
    <div class="center-screen">
      <div class="card stack" style="max-width: 380px; width: 100%; text-align: center">
        <h1 style="margin: 0; font-size: 1.3rem">Stake Presidency Tools</h1>
        <p class="muted text-sm">
          Sign in with the Google account your stake administrator has authorized.
        </p>
        <button class="btn btn-primary btn-block" (click)="signIn()">Sign in with Google</button>
        @if (authService.authError(); as error) {
          <p class="text-danger text-sm">{{ error }}</p>
        }
        <p class="muted text-sm">
          Having trouble on the meetinghouse network? Try the
          <a href="/diagnostics">diagnostics page</a>.
        </p>
      </div>
    </div>
  `,
})
export class LoginComponent {
  protected readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  constructor() {
    // If sign-in resolves while this page is showing, move on automatically
    // rather than making the person click something else.
    effect(() => {
      const status = this.authService.status();
      if (status === 'authorized') void this.router.navigateByUrl('/');
      if (status === 'unauthorized') void this.router.navigateByUrl('/access-denied');
    });
  }

  signIn(): void {
    void this.authService.signInWithGoogle();
  }
}
