/**
 * Vocabulary of the calling names we care about for stake presidency work,
 * plus the machinery for finding them inside an LCR "Callings" cell (which
 * is a space-joined list of calling names with no delimiters).
 *
 * Three top-level buckets: stake-level callings (everything shown on the
 * stake org report in LCR — presidencies, high council, patriarch,
 * auxiliaries, auditors, communication, seminary/institute, welfare,
 * custom stake callings, etc.), ward/branch bishoprics, and Elders Quorum
 * presidencies. The stake bucket is subdivided into the same categories
 * LCR uses so the New Calling dropdown can present them as optgroups.
 *
 * Ward-side callings outside the bishopric (Sunday School teacher, ward
 * music leader, activity coordinator, etc.) are intentionally out of
 * scope — those are the bishop's to fill, not the stake presidency's.
 *
 * Match uses word boundaries and iterates patterns longest-first so that
 * a shorter pattern doesn't double-count within the same substring:
 * "Bishopric First Counselor" wins over the bare "Bishop", "Assistant
 * Communication Director" wins over "Communication Director", etc.
 */

export type Bucket = 'stake' | 'bishopric' | 'eq';

export interface StakeRoleGroup {
  /** Label shown as an <optgroup> in the New Calling dropdown. */
  readonly label: string;
  readonly roles: readonly string[];
}

/**
 * Stake-level callings grouped the same way LCR groups them on the stake
 * org report. Order within a group is presidency → counselors → secretary
 * → other; group order roughly follows the LCR page.
 */
export const STAKE_ROLE_GROUPS: readonly StakeRoleGroup[] = [
  {
    label: 'Stake Presidency & Office',
    roles: [
      'Stake President',
      'Stake Presidency First Counselor',
      'Stake Presidency Second Counselor',
      'Stake Executive Secretary',
      'Stake Assistant Executive Secretary',
      'Stake Clerk',
      'Stake Assistant Clerk--Finance',
      'Stake Assistant Clerk--Membership',
      'Stake Assistant Clerk',
    ],
  },
  {
    label: 'High Council & Patriarch',
    roles: ['Stake High Councilor', 'Patriarch'],
  },
  {
    label: 'Stake Relief Society',
    roles: [
      'Stake Relief Society President',
      'Stake Relief Society First Counselor',
      'Stake Relief Society Second Counselor',
      'Stake Relief Society Secretary',
    ],
  },
  {
    label: 'Stake Young Men',
    roles: [
      'Stake Young Men President',
      'Stake Young Men First Counselor',
      'Stake Young Men Second Counselor',
      'Stake Young Men Secretary',
      'Young Men Camp Director',
      'Young Men Assistant Camp Director',
    ],
  },
  {
    label: 'Stake Young Women',
    roles: [
      'Stake Young Women President',
      'Stake Young Women First Counselor',
      'Stake Young Women Second Counselor',
      'Stake Young Women Secretary',
      'Young Women Camp Director',
      'Young Women Assistant Camp Director',
    ],
  },
  {
    label: 'Stake Sunday School',
    roles: [
      'Stake Sunday School President',
      'Stake Sunday School First Counselor',
      'Stake Sunday School Second Counselor',
      'Stake Sunday School Secretary',
    ],
  },
  {
    label: 'Stake Primary',
    roles: [
      'Stake Primary President',
      'Stake Primary First Counselor',
      'Stake Primary Second Counselor',
      'Stake Primary Secretary',
      'Stake Primary Music Leader',
    ],
  },
  {
    label: 'Young Single Adult',
    roles: [
      'Stake Young Single Adult Adviser',
      'Stake Young Single Adult Representative',
      'Young Single Adult Committee Chair',
      'Young Single Adult Committee Member',
    ],
  },
  {
    label: 'Single Adult',
    roles: ['Stake Single Adult Adviser', 'Stake Single Adult Representative'],
  },
  {
    label: 'Temple & Family History',
    roles: [
      'FamilySearch Center Coordinator',
      'Family History Center Director',
      'Indexing Specialist',
    ],
  },
  {
    label: 'Activities & Sports',
    roles: [
      'Stake Cultural Arts Director',
      'Stake Activities Committee Chairman',
      'Stake Physical Activities Director',
      'Stake Sports Officials Coordinator',
      'Stake Sports Official',
      'Stake Sports Specialist',
    ],
  },
  {
    label: 'Auditing',
    roles: ['Audit Committee Chairman', 'Audit Committee Member', 'Auditor'],
  },
  {
    label: 'Church Communication',
    roles: [
      'Communication Director',
      'Assistant Communication Director',
      'Communication Specialist',
      'JustServe Specialist',
    ],
  },
  {
    label: 'Church Service Missionaries',
    roles: ['Stake CS Missionary'],
  },
  {
    label: 'Facilities',
    roles: [
      'Stake Building Representative',
      'Stake Building Specialist',
      'Stake Scheduler--Building 1',
      'Stake Recreation Camp Manager and Scheduler',
      'Stake Recreation Camp Service Missionary',
      'Stake Recreation Camp Manager',
      'Stake Recreation Camp Scheduler',
    ],
  },
  {
    label: 'For the Strength of Youth',
    roles: ['FSY Conferences Representative'],
  },
  {
    label: 'History',
    roles: ['History Specialist'],
  },
  {
    label: 'Military Relations',
    roles: ['Military Relations Specialist'],
  },
  {
    label: 'Music',
    roles: ['Stake Music Coordinator', 'Stake Music Adviser', 'Stake Music Specialist'],
  },
  {
    label: 'Seminary & Institute',
    roles: [
      'Institute Supervisor',
      'Institute Teacher',
      'Seminary Supervisor',
      'Seminary Teacher',
      'S&I Succeed in School Supervisor',
      'S&I Succeed in School Instructor',
    ],
  },
  {
    label: 'Technology',
    roles: ['Technology Specialist', 'Stake Interpretation Coordinator', 'Stake Interpreter'],
  },
  {
    label: 'Welfare & Self-Reliance',
    roles: [
      'Stake Welfare and Self-Reliance Specialist',
      'Self-Reliance Group Facilitator',
      'Stake Disability Specialist',
      'Disability Activity Leader',
      'Stake Emergency Preparedness Director',
      'Stake Recovery Lead',
      'Emergency Communications Specialist',
      'Ministering Specialist to H2',
      'ARP North',
      'ARP east',
    ],
  },
  {
    label: 'Additional (Custom)',
    roles: [
      'Stake Storehouse Coordinator, East',
      'Stake Storehouse Coordinator, West',
      'Temple Ordinance Worker - ATL',
      'Temple Ordinance Worker - COL',
      'Asst Stk Camp Director',
      'Stake YW Camp Director',
    ],
  },
];

/** Flat list of every stake-level calling. Order is UI order (grouped). */
export const STAKE_ROLES: readonly string[] = STAKE_ROLE_GROUPS.flatMap((g) => g.roles);

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
 * Union of ward-bishopric + branch-presidency roles. Kept as one array
 * because from the matcher's point of view "bishopric" is one bucket;
 * the matcher sorts by length before iterating so ordering here is UI-
 * only (dropdowns present them in the order they appear).
 */
export const BISHOPRIC_ROLES: string[] = [
  ...WARD_BISHOPRIC_ROLES,
  ...BRANCH_PRESIDENCY_ROLES,
];

export const EQ_ROLES: string[] = [
  'Elders Quorum President',
  'Elders Quorum First Counselor',
  'Elders Quorum Second Counselor',
  'Elders Quorum Secretary',
  'Elders Quorum Assistant Secretary',
];

/** Longest-first ordering — needed so "Assistant Communication Director"
 *  matches before the bare "Communication Director" would consume it. */
function longestFirst(roles: readonly string[]): string[] {
  return [...roles].sort((a, b) => b.length - a.length);
}

const BUCKETS: Array<{ bucket: Bucket; roles: string[] }> = [
  { bucket: 'stake', roles: longestFirst(STAKE_ROLES) },
  { bucket: 'bishopric', roles: longestFirst(BISHOPRIC_ROLES) },
  { bucket: 'eq', roles: longestFirst(EQ_ROLES) },
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
 * - 'ward'   → ward bishopric; pick from wards only.
 * - 'branch' → branch presidency; pick from branches only.
 * - 'ward_or_branch' → elders quorum; per Handbook 30.8.2 branches
 *              follow ward rules for internal callings (substituting
 *              "branch" for "ward"), so an EQ calling could sit inside
 *              a branch that's large enough to have a formal quorum.
 */
export type CallingUnitScope = 'none' | 'ward' | 'branch' | 'ward_or_branch';

export function unitScopeFor(role: string | null | undefined): CallingUnitScope {
  if (!role) return 'none';
  if (STAKE_ROLES.includes(role)) return 'none';
  if (BRANCH_PRESIDENCY_ROLES.includes(role)) return 'branch';
  if (WARD_BISHOPRIC_ROLES.includes(role)) return 'ward';
  if (EQ_ROLES.includes(role)) return 'ward_or_branch';
  return 'none';
}
