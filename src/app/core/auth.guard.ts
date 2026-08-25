import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Gate for every protected route. Waits for the initial Firebase Auth +
 * users/{uid} lookup to settle, then routes signed-out visitors to /login
 * and authenticated-but-unapproved visitors to /access-denied. This is a
 * UX convenience only - firestore.rules is the actual security boundary,
 * since a guard can always be bypassed by talking to Firestore directly.
 */
export const authGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const status = await authService.waitUntilResolved();

  if (status === 'authorized') return true;
  if (status === 'signed_out') return router.createUrlTree(['/login']);
  return router.createUrlTree(['/access-denied']);
};
