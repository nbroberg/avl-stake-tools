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

/** Only the presidency can propose new calling/release workflows. */
export function canCreateWorkflow(user: AppUser | null): boolean {
  return isPresidency(user);
}

/** Only the presidency can edit workflow notes. */
export function canEditNotes(user: AppUser | null): boolean {
  return isPresidency(user);
}

/** Only the presidency can delete a calling/release/advancement workflow. */
export function canDeleteWorkflow(user: AppUser | null): boolean {
  return isPresidency(user);
}

/** Only the presidency can roll a workflow back a step - see canAdvanceStatus. */
export function canRollbackStatus(user: AppUser | null): boolean {
  return isPresidency(user);
}

/**
 * Whether the caller may advance a workflow from `from` to `to`.
 * - Presidency: any legal transition.
 * - High Council: presidency_approved -> high_council_approved (their
 *   vote), and the sustaining/setting-apart/ordaining steps a councilor
 *   performs in person while visiting a unit on a Sunday -
 *   accepted/released -> sustained, accepted/released -> set_apart
 *   (sustained and set apart in the same visit), sustained -> set_apart
 *   (set apart on a later visit), and high_council_approved -> ordained
 *   (a priesthood advancement, performed the same way). See
 *   core/sunday-visit.ts for the presence rule that decides which of
 *   those a given workflow is eligible for.
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
    if (from === 'presidency_approved' && to === 'high_council_approved') return true;
    if ((from === 'accepted' || from === 'released') && (to === 'sustained' || to === 'set_apart')) {
      return true;
    }
    if (from === 'sustained' && to === 'set_apart') return true;
    if (from === 'high_council_approved' && to === 'ordained') return true;
  }
  return false;
}
