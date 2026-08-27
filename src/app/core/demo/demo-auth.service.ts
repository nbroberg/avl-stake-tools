import { Injectable, signal } from '@angular/core';
import type { User as FirebaseUser } from 'firebase/auth';
import type { AuthService, AuthStatus } from '../auth.service';
import type { AppUser, Role } from '../../models/types';
import { DEMO_USER } from './demo-data';

/**
 * Stand-in for AuthService in demo mode. Reports an authorized pretend
 * user immediately, so the route guard lets every protected page render
 * without a Firebase project or an approved Google account.
 *
 * `implements Pick<AuthService, ...>` is deliberate: it makes the compiler
 * fail here if the real service's public surface changes, rather than
 * letting demo mode drift quietly out of sync.
 */
@Injectable()
export class DemoAuthService
  implements
    Pick<
      AuthService,
      'status' | 'firebaseUser' | 'appUser' | 'authError' | 'waitUntilResolved' | 'signInWithGoogle' | 'signOut'
    >
{
  readonly status = signal<AuthStatus>('authorized');
  // Nothing in the UI needs a real Firebase user object; only the
  // access-denied page reads it, and demo mode never lands there.
  readonly firebaseUser = signal<FirebaseUser | null>(null);
  readonly appUser = signal<AppUser | null>({ ...DEMO_USER });
  readonly authError = signal<string | null>(null);

  waitUntilResolved(): Promise<AuthStatus> {
    return Promise.resolve(this.status());
  }

  /** Signing back in after a demo sign-out just restores the pretend user. */
  async signInWithGoogle(): Promise<void> {
    this.appUser.set({ ...DEMO_USER, role: this.role() });
    this.status.set('authorized');
  }

  async signOut(): Promise<void> {
    this.appUser.set(null);
    this.status.set('signed_out');
  }

  /**
   * Demo-only: swap the pretend user's role. The presidency and high
   * council see materially different UI (who can create workflows, who
   * votes on high council approval), and switching is the only way to
   * exercise both without two real accounts.
   */
  readonly role = signal<Role>(DEMO_USER.role);

  setRole(role: Role): void {
    this.role.set(role);
    const user = this.appUser();
    if (user) this.appUser.set({ ...user, role });
  }
}
