/**
 * Vocabulary of the calling names we care about for stake presidency work,
 * plus the machinery for finding them inside an LCR "Callings" cell (which
 * is a space-joined list of calling names with no delimiters).
 *
 * Three buckets: stake-level callings, ward/branch bishoprics (or branch
 * presidencies), and Elders Quorum presidencies. Everything else - Sunday
 * School teachers, ward music leaders, seminary teachers, activity
 * coordinators - is intentionally out of scope.
 *
 * Pattern list is ordered longest-first per bucket. Match uses word
 * boundaries and rewrites longer patterns' matches with spaces so a
 * shorter pattern doesn't double-count within the same substring:
 * "Bishopric First Counselor" wins over the bare "Bishop", "Stake Sunday
 * School Second Counselor" wins over "Stake Sunday School", etc.
 *
 * A short EXCLUDES list blanks out calling names that would otherwise
 * accidentally match a shorter in-scope prefix ("Stake Welfare and
 * Self-Reliance Specialist" starts with "Stake", but is not a stake-
 * calling in the leadership sense).
 */

export type Bucket = 'stake' | 'bishopric' | 'eq';

export const STAKE_ROLES: string[] = [
  'Stake Presidency First Counselor',
  'Stake Presidency Second Counselor',
  'Stake Executive Secretary',
  'Stake Assistant Clerk--Finance',
  'Stake Assistant Clerk--Membership',
  'Stake Assistant Clerk',
  'Stake Clerk',
  'Stake High Councilor',
  'Patriarch',
  'Stake Young Women First Counselor',
  'Stake Young Women Second Counselor',
  'Stake Young Women Secretary',
  'Stake Young Women President',
  'Stake Young Men First Counselor',
  'Stake Young Men Second Counselor',
  'Stake Young Men Secretary',
  'Stake Young Men President',
  'Stake Primary First Counselor',
  'Stake Primary Second Counselor',
  'Stake Primary Secretary',
  'Stake Primary President',
  'Stake Relief Society First Counselor',
  'Stake Relief Society Second Counselor',
  'Stake Relief Society Secretary',
  'Stake Relief Society President',
  'Stake Sunday School First Counselor',
  'Stake Sunday School Second Counselor',
  'Stake Sunday School President',
  'Stake President',
];

/** Ward-side bishopric roles - Bishop, counselors, clerks, exec secs. */
export const WARD_BISHOPRIC_ROLES: string[] = [
  'Bishop',
  'Bishopric First Counselor',
  'Bishopric Second Counselor',
  'Ward Executive Secretary',
  'Ward Assistant Executive Secretary',
  'Ward Clerk',
  'Ward Assistant Clerk',
  'Ward Assistant Clerk--Finance',
  'Ward Assistant Clerk--Membership',
];

/** Branch equivalents of the bishopric roles. */
export const BRANCH_PRESIDENCY_ROLES: string[] = [
  'Branch President',
  'Branch Presidency First Counselor',
  'Branch Presidency Second Counselor',
  'Branch Executive Secretary',
  'Branch Clerk',
  'Branch Assistant Clerk',
  'Branch Assistant Clerk--Finance',
  'Branch Assistant Clerk--Membership',
];

/**
 * Union of ward-bishopric + branch-presidency roles, in the longest-first
 * order the matcher needs. Longer prefixes come first so "Bishopric First
 * Counselor" and "Ward Assistant Clerk--Finance" match before the bare
 * "Bishop" or "Ward Assistant Clerk". Kept as one array because from the
 * matcher's point of view "bishopric" is one bucket.
 */
export const BISHOPRIC_ROLES: string[] = [
  'Bishopric First Counselor',
  'Bishopric Second Counselor',
  'Ward Assistant Executive Secretary',
  'Ward Executive Secretary',
  'Ward Assistant Clerk--Membership',
  'Ward Assistant Clerk--Finance',
  'Ward Assistant Clerk',
  'Ward Clerk',
  'Bishop',
  'Branch Presidency First Counselor',
  'Branch Presidency Second Counselor',
  'Branch Executive Secretary',
  'Branch Assistant Clerk--Finance',
  'Branch Assistant Clerk--Membership',
  'Branch Assistant Clerk',
  'Branch Clerk',
  'Branch President',
];

export const EQ_ROLES: string[] = [
  'Elders Quorum First Counselor',
  'Elders Quorum Second Counselor',
  'Elders Quorum Assistant Secretary',
  'Elders Quorum Secretary',
  'Elders Quorum President',
];

const BUCKETS: Array<{ bucket: Bucket; roles: string[] }> = [
  { bucket: 'stake', roles: STAKE_ROLES },
  { bucket: 'bishopric', roles: BISHOPRIC_ROLES },
  { bucket: 'eq', roles: EQ_ROLES },
];

const EXCLUDES: string[] = [
  'Stake Building Representative',
  'Stake Music Coordinator',
  'Stake Music Specialist',
  'Stake Recovery Lead',
  'Stake Welfare and Self-Reliance Specialist',
  'Stake Young Single Adult Representative',
  'Stake Single Adult Representative',
  'Stake CS Missionary',
  'Branch Mission Leader',
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Returns the in-scope calling role strings found inside `callingsText`,
 * as canonical role names (matching the entries in STAKE_ROLES /
 * BISHOPRIC_ROLES / EQ_ROLES). De-duplicated, in the order they were
 * found. Returns [] when no in-scope calling is present.
 */
export function extractInScopeCallings(callingsText: string): string[] {
  if (!callingsText) return [];
  let working = ' ' + callingsText + ' ';
  for (const x of EXCLUDES) {
    working = working.replace(new RegExp(escapeRegex(x), 'g'), ' '.repeat(x.length));
  }
  const hits: string[] = [];
  for (const { roles } of BUCKETS) {
    for (const role of roles) {
      // Word boundary: next char must not be a letter, which distinguishes
      // "Bishop" from "Bishopric", "Stake President" from "Stake Presidency",
      // "Branch President" from "Branch Presidency".
      const regex = new RegExp(escapeRegex(role) + '(?![A-Za-z])');
      const m = regex.exec(working);
      if (m) {
        hits.push(role);
        const start = m.index;
        const end = start + m[0].length;
        working = working.slice(0, start) + ' '.repeat(end - start) + working.slice(end);
      }
    }
  }
  return hits;
}

/** Which bucket a role belongs to, or null if the role is out of scope. */
export function bucketOf(role: string): Bucket | null {
  for (const { bucket, roles } of BUCKETS) {
    if (roles.includes(role)) return bucket;
  }
  return null;
}

/** True when a person's callings list contains any of these role names. */
export function hasAnyRole(callings: string[] | undefined, roles: string[]): boolean {
  if (!callings || callings.length === 0) return false;
  for (const r of roles) {
    if (callings.includes(r)) return true;
  }
  return false;
}

/**
 * What kind of unit a calling belongs to. Drives the New Calling form's
 * Unit dropdown:
 * - 'none'   → stake-level; no unit is stored or shown.
 * - 'ward'   → ward bishopric or elders quorum; pick from wards only.
 * - 'branch' → branch presidency; pick from branches only.
 */
export type CallingUnitScope = 'none' | 'ward' | 'branch';

export function unitScopeFor(role: string | null | undefined): CallingUnitScope {
  if (!role) return 'none';
  if (STAKE_ROLES.includes(role)) return 'none';
  if (BRANCH_PRESIDENCY_ROLES.includes(role)) return 'branch';
  if (WARD_BISHOPRIC_ROLES.includes(role)) return 'ward';
  if (EQ_ROLES.includes(role)) return 'ward';
  return 'none';
}
