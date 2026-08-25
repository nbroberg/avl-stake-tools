import { Injectable, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { filter, firstValueFrom, take } from 'rxjs';
import { auth, db, googleProvider } from './firebase';
import type { AppUser } from '../models/types';

export type AuthStatus =
  | 'loading' // still resolving Firebase Auth state
  | 'signed_out'
  | 'checking_authorization' // signed in, waiting on users/{uid} lookup
  | 'unauthorized' // signed in, but no active app user record
  | 'authorized';

/**
 * Two-step auth model, per the app's design principle: Firebase
 * Authentication establishes IDENTITY only. Whether that identity is
 * ALLOWED to use the app is a separate question, answered by looking up
 * users/{firebaseUid} in Firestore. An authenticated-but-unapproved Google
 * account lands in the "unauthorized" status and must see no protected
 * data - enforced here for a good UX, and independently in
 * firestore.rules so it can't be bypassed client-side.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly status = signal<AuthStatus>('loading');
  readonly firebaseUser = signal<FirebaseUser | null>(null);
  readonly appUser = signal<AppUser | null>(null);
  readonly authError = signal<string | null>(null);

  // Created once, in the constructor's injection context, so it can be
  // safely awaited later (e.g. from a route guard) via waitUntilResolved().
  private readonly status$ = toObservable(this.status);

  private userDocUnsubscribe: Unsubscribe | null = null;

  constructor() {
    onAuthStateChanged(auth, (user) => {
      this.firebaseUser.set(user);
      this.userDocUnsubscribe?.();
      this.userDocUnsubscribe = null;

      if (!user) {
        this.appUser.set(null);
        this.status.set('signed_out');
        return;
      }

      this.status.set('checking_authorization');
      this.userDocUnsubscribe = onSnapshot(
        doc(db, 'users', user.uid),
        (snap) => {
          const data = snap.data() as AppUser | undefined;
          if (!snap.exists() || !data?.active) {
            this.appUser.set(null);
            this.status.set('unauthorized');
            return;
          }
          this.appUser.set({ ...data, firebaseUid: user.uid });
          this.status.set('authorized');
        },
        () => {
          // Permission-denied here most likely means the security rules
          // correctly rejected the lookup for an unapproved account.
          this.appUser.set(null);
          this.status.set('unauthorized');
        },
      );
    });
  }

  /** Resolves once the initial auth + authorization check has settled. */
  waitUntilResolved(): Promise<AuthStatus> {
    return firstValueFrom(
      this.status$.pipe(
        filter((s) => s !== 'loading' && s !== 'checking_authorization'),
        take(1),
      ),
    );
  }

  async signInWithGoogle(): Promise<void> {
    this.authError.set(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      this.authError.set(err instanceof Error ? err.message : 'Sign-in failed.');
    }
  }

  async signOut(): Promise<void> {
    await firebaseSignOut(auth);
  }
}
