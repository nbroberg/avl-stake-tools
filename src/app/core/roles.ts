import type { AppUser, Role } from '../models/types';

/**
 * UX-only role helpers. Firestore Security Rules (see firestore.rules) are
 * the actual authorization boundary - these helpers exist only to hide UI
 * that would fail against the rules anyway, keeping the app coherent for
 * whoever is signed in. Never gate anything security-critical on these.
 */

export function hasRole(user: AppUser | null, roles: Role[]): boolean {
  if (!user || !user.active) return false;
  return roles.includes(user.role);
}

export function isPresidency(user: AppUser | null): boolean {
  return hasRole(user, ['stake_presidency']);
}

export function isHighCouncil(user: AppUser | null): boolean {
  return hasRole(user, ['high_council']);
}

/** Roster is read by everyone signed in; only the presidency edits it. */
export function canManageRoster(user: AppUser | null): boolean {
  return isPresidency(user);
}

/** Only the presidency can propose new calling/release workflows. */
export function canCreateWorkflow(user: AppUser | null): boolean {
  return isPresidency(user);
}

/** Only the presidency can edit workflow notes. */
export function canEditNotes(user: AppUser | null): boolean {
  return isPresidency(user);
}

/**
 * Whether the caller may advance a workflow from `from` to `to`.
 * - Presidency: any legal transition.
 * - High Council: only presidency_approved -> high_council_approved.
 * The legality of `from -> to` itself is checked separately via
 * getNextStatuses(); this helper only enforces the ROLE-based scoping.
 */
export function canAdvanceStatus(
  user: AppUser | null,
  from: string,
  to: string,
): boolean {
  if (isPresidency(user)) return true;
  if (isHighCouncil(user)) {
    return from === 'presidency_approved' && to === 'high_council_approved';
  }
  return false;
}
