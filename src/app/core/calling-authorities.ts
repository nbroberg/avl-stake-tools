import {
  BRANCH_PRESIDENCY_ROLES,
  WARD_BISHOPRIC_ROLES,
  bucketOf,
} from './callings-vocabulary';
import type { Person } from '../models/types';

/**
 * Handbook 30.8 (Chart of Callings) encoded for this stake. For each
 * calling we track four columns from the handbook:
 *
 *  - `recommend`   — who proposes the person for the calling.
 *  - `approve`     — the deliberative body that approves it. Drives the
 *                     workflow: 'stake_presidency_and_high_council'
 *                     triggers the High Council approval step; anything
 *                     else skips it. The four external bodies (First
 *                     Presidency, First Presidency + Twelve, Quorum of
 *                     the Twelve, GA/Area Seventy) trigger the "external
 *                     approval required" banner.
 *  - `sustain`     — where the calling is sustained.
 *  - `callSetApart`— who is authorized to extend and set apart. Drives
 *                     the Interview Assigned and (optionally) Set Apart
 *                     dropdowns: only people whose current roles match
 *                     these actors show up.
 *
 * The branch section assumes the branch is inside this stake (not in a
 * mission or independent district) — the handbook's alternative chain
 * for mission/district branches is captured only as a note.
 */

export type Actor =
  | 'stake_president'
  | 'stake_presidency_counselor'
  | 'high_councilor'
  | 'bishop'
  | 'bishopric_counselor'
  | 'branch_president'
  | 'branch_presidency_counselor'
  | 'quorum_president'
  | 'quorum_presidency_counselor'
  | 'stake_org_president'
  | 'stake_audit_committee_chairman'
  | 'general_authority_or_area_seventy'
  | 'first_presidency_member_or_twelve';

export const ACTOR_LABELS: Record<Actor, string> = {
  stake_president: 'Stake president',
  stake_presidency_counselor: 'Counselor in the stake presidency',
  high_councilor: 'High councilor',
  bishop: 'Bishop',
  bishopric_counselor: 'Counselor in the bishopric',
  branch_president: 'Branch president',
  branch_presidency_counselor: 'Counselor in the branch presidency',
  quorum_president: 'Elders quorum president',
  quorum_presidency_counselor: 'Counselor in the elders quorum presidency',
  stake_org_president: 'President of the stake organization',
  stake_audit_committee_chairman: 'Chairman of the stake audit committee',
  general_authority_or_area_seventy: 'General Authority or Area Seventy',
  first_presidency_member_or_twelve: 'Member of the First Presidency or Quorum of the Twelve',
};

export type ApprovalBody =
  | 'stake_presidency'
  | 'stake_presidency_and_high_council'
  | 'bishopric'
  | 'first_presidency'
  | 'first_presidency_and_twelve'
  | 'quorum_of_twelve'
  | 'general_authority_or_area_seventy';

export const APPROVAL_LABELS: Record<ApprovalBody, string> = {
  stake_presidency: 'Stake presidency',
  stake_presidency_and_high_council: 'Stake presidency and high council',
  bishopric: 'Bishopric',
  first_presidency: 'First Presidency',
  first_presidency_and_twelve: 'First Presidency and Quorum of the Twelve',
  quorum_of_twelve: 'Quorum of the Twelve',
  general_authority_or_area_seventy: 'General Authority or Area Seventy',
};

export type Sustainer =
  | 'stake_conference'
  | 'ward'
  | 'branch'
  | 'quorum'
  | 'class'
  | 'none';

export const SUSTAINER_LABELS: Record<Sustainer, string> = {
  stake_conference: 'Members in stake conference',
  ward: 'Ward members',
  branch: 'Branch members',
  quorum: 'Quorum members',
  class: 'Class members',
  none: 'Not sustained',
};

export interface CallingAuthorities {
  readonly recommend: readonly Actor[];
  readonly approve: ApprovalBody;
  readonly sustain: Sustainer;
  readonly callSetApart: readonly Actor[];
  /** Freeform note for edge cases (patriarch, YM/SS chosen from HC, etc.). */
  readonly notes?: string;
}

// Reusable actor lists to keep the override table readable.
const STAKE_PRES_ONLY: readonly Actor[] = ['stake_president'];
const STAKE_PRES_OR_COUNSELOR: readonly Actor[] = [
  'stake_president',
  'stake_presidency_counselor',
];
const STAKE_PRES_COUNSELOR_OR_HC: readonly Actor[] = [
  'stake_president',
  'stake_presidency_counselor',
  'high_councilor',
];

/** Default for stake callings — Handbook 30.8.3 "Other stake callings". */
const OTHER_STAKE: CallingAuthorities = {
  recommend: STAKE_PRES_OR_COUNSELOR,
  approve: 'stake_presidency_and_high_council',
  sustain: 'stake_conference',
  callSetApart: STAKE_PRES_COUNSELOR_OR_HC,
};

/** Stake clerks, exec secs, high councilors — everything Handbook lists
 *  as "Stake president or an assigned counselor" (no high councilor). */
const STAKE_CLERK_STYLE: CallingAuthorities = {
  ...OTHER_STAKE,
  callSetApart: STAKE_PRES_OR_COUNSELOR,
};

/** Counselors and secretaries in stake organization presidencies. */
const STAKE_ORG_COUNSELOR: CallingAuthorities = {
  recommend: ['stake_org_president'],
  approve: 'stake_presidency_and_high_council',
  sustain: 'stake_conference',
  callSetApart: STAKE_PRES_COUNSELOR_OR_HC,
};

/** Ward-side default for clerks/exec secs. Bishop and counselors have
 *  their own overrides. */
const WARD_CLERK_STYLE: CallingAuthorities = {
  recommend: ['bishop', 'bishopric_counselor'],
  approve: 'stake_presidency_and_high_council',
  sustain: 'ward',
  callSetApart: STAKE_PRES_COUNSELOR_OR_HC,
};

/** Branch equivalents (stake-adjacent branch only). */
const BRANCH_CLERK_STYLE: CallingAuthorities = {
  recommend: ['branch_president', 'branch_presidency_counselor'],
  approve: 'stake_presidency_and_high_council',
  sustain: 'branch',
  callSetApart: STAKE_PRES_COUNSELOR_OR_HC,
};

const COUNSELOR_IN_EXISTING_PRESIDENCY: CallingAuthorities = {
  recommend: ['stake_president'],
  approve: 'first_presidency',
  sustain: 'stake_conference',
  callSetApart: ['stake_president'],
  notes:
    'New counselor in an existing stake presidency. The stake president extends and sets apart after receiving approval from the First Presidency.',
};

const OVERRIDES: Record<string, CallingAuthorities> = {
  // ---- Stake Presidency & Office ----
  'Stake President': {
    recommend: ['general_authority_or_area_seventy'],
    approve: 'general_authority_or_area_seventy',
    sustain: 'stake_conference',
    callSetApart: ['general_authority_or_area_seventy'],
  },
  'Stake Presidency First Counselor': COUNSELOR_IN_EXISTING_PRESIDENCY,
  'Stake Presidency Second Counselor': COUNSELOR_IN_EXISTING_PRESIDENCY,
  'Stake Clerk': STAKE_CLERK_STYLE,
  'Stake Assistant Clerk': STAKE_CLERK_STYLE,
  'Stake Assistant Clerk--Finance': STAKE_CLERK_STYLE,
  'Stake Assistant Clerk--Membership': STAKE_CLERK_STYLE,
  'Stake Executive Secretary': STAKE_CLERK_STYLE,
  'Stake Assistant Executive Secretary': STAKE_CLERK_STYLE,

  // ---- High Council & Patriarch ----
  'Stake High Councilor': STAKE_CLERK_STYLE,
  Patriarch: {
    recommend: STAKE_PRES_OR_COUNSELOR,
    approve: 'quorum_of_twelve',
    sustain: 'stake_conference',
    callSetApart: ['stake_president', 'first_presidency_member_or_twelve'],
    notes:
      'Stake president after receiving approval from the Quorum of the Twelve; or a member of the First Presidency or Quorum of the Twelve.',
  },

  // ---- Stake auxiliary presidents ----
  'Stake Relief Society President': {
    recommend: STAKE_PRES_OR_COUNSELOR,
    approve: 'stake_presidency_and_high_council',
    sustain: 'stake_conference',
    callSetApart: STAKE_PRES_ONLY,
  },
  'Stake Young Women President': STAKE_CLERK_STYLE,
  'Stake Primary President': STAKE_CLERK_STYLE,
  'Stake Young Men President': {
    ...STAKE_CLERK_STYLE,
    notes:
      'The stake presidency calls a high councilor to this position. Sustained and set apart both as a high councilor and as president.',
  },
  'Stake Sunday School President': {
    ...STAKE_CLERK_STYLE,
    notes:
      'The stake presidency calls a high councilor to this position. Sustained and set apart both as a high councilor and as president.',
  },

  // ---- Stake auxiliary counselors & secretaries ----
  'Stake Relief Society First Counselor': STAKE_ORG_COUNSELOR,
  'Stake Relief Society Second Counselor': STAKE_ORG_COUNSELOR,
  'Stake Relief Society Secretary': STAKE_ORG_COUNSELOR,
  'Stake Young Women First Counselor': STAKE_ORG_COUNSELOR,
  'Stake Young Women Second Counselor': STAKE_ORG_COUNSELOR,
  'Stake Young Women Secretary': STAKE_ORG_COUNSELOR,
  'Stake Primary First Counselor': STAKE_ORG_COUNSELOR,
  'Stake Primary Second Counselor': STAKE_ORG_COUNSELOR,
  'Stake Primary Secretary': STAKE_ORG_COUNSELOR,
  'Stake Young Men First Counselor': STAKE_ORG_COUNSELOR,
  'Stake Young Men Second Counselor': STAKE_ORG_COUNSELOR,
  'Stake Young Men Secretary': STAKE_ORG_COUNSELOR,
  'Stake Sunday School First Counselor': STAKE_ORG_COUNSELOR,
  'Stake Sunday School Second Counselor': STAKE_ORG_COUNSELOR,
  'Stake Sunday School Secretary': STAKE_ORG_COUNSELOR,

  // ---- Auditing ----
  Auditor: {
    recommend: ['stake_audit_committee_chairman'],
    approve: 'stake_presidency_and_high_council',
    sustain: 'none',
    callSetApart: STAKE_PRES_OR_COUNSELOR,
    notes: 'The stake president determines whether setting apart is needed.',
  },

  // ---- Ward Bishopric ----
  Bishop: {
    recommend: STAKE_PRES_OR_COUNSELOR,
    approve: 'first_presidency_and_twelve',
    sustain: 'ward',
    callSetApart: ['stake_president'],
    notes:
      'Recommended by the stake presidency using LCR. Called and set apart by the stake president after receiving approval from the First Presidency.',
  },
  'Bishopric First Counselor': {
    recommend: ['bishop'],
    approve: 'stake_presidency_and_high_council',
    sustain: 'ward',
    callSetApart: STAKE_PRES_OR_COUNSELOR,
  },
  'Bishopric Second Counselor': {
    recommend: ['bishop'],
    approve: 'stake_presidency_and_high_council',
    sustain: 'ward',
    callSetApart: STAKE_PRES_OR_COUNSELOR,
  },

  // ---- Branch Presidency (stake-adjacent variant) ----
  'Branch President': {
    recommend: STAKE_PRES_OR_COUNSELOR,
    approve: 'stake_presidency_and_high_council',
    sustain: 'branch',
    callSetApart: ['stake_president'],
    notes:
      'This authority applies when the branch is inside a stake. Branches in a mission or district follow a different chain (mission or district presidency).',
  },
  'Branch Presidency First Counselor': {
    recommend: ['branch_president'],
    approve: 'stake_presidency_and_high_council',
    sustain: 'branch',
    callSetApart: STAKE_PRES_OR_COUNSELOR,
  },
  'Branch Presidency Second Counselor': {
    recommend: ['branch_president'],
    approve: 'stake_presidency_and_high_council',
    sustain: 'branch',
    callSetApart: STAKE_PRES_OR_COUNSELOR,
  },

  // ---- Elders Quorum presidency ----
  'Elders Quorum President': {
    recommend: STAKE_PRES_OR_COUNSELOR,
    approve: 'stake_presidency_and_high_council',
    sustain: 'ward',
    callSetApart: STAKE_PRES_ONLY,
    notes: 'The stake presidency recommends in consultation with the bishop.',
  },
  'Elders Quorum First Counselor': {
    recommend: ['quorum_president'],
    approve: 'stake_presidency_and_high_council',
    sustain: 'ward',
    callSetApart: STAKE_PRES_COUNSELOR_OR_HC,
    notes: 'The quorum president recommends in consultation with the bishop.',
  },
  'Elders Quorum Second Counselor': {
    recommend: ['quorum_president'],
    approve: 'stake_presidency_and_high_council',
    sustain: 'ward',
    callSetApart: STAKE_PRES_COUNSELOR_OR_HC,
    notes: 'The quorum president recommends in consultation with the bishop.',
  },
  'Elders Quorum Secretary': {
    recommend: ['quorum_president', 'quorum_presidency_counselor'],
    approve: 'bishopric',
    sustain: 'quorum',
    callSetApart: ['quorum_president', 'quorum_presidency_counselor'],
  },
  'Elders Quorum Assistant Secretary': {
    recommend: ['quorum_president', 'quorum_presidency_counselor'],
    approve: 'bishopric',
    sustain: 'quorum',
    callSetApart: ['quorum_president', 'quorum_presidency_counselor'],
  },
};

/**
 * Returns the calling's authorities entry from OVERRIDES, or the bucket
 * default when the calling isn't singled out. Callings outside every
 * vocabulary bucket return null (nothing this app knows how to route).
 */
export function authoritiesFor(callingName: string): CallingAuthorities | null {
  const override = OVERRIDES[callingName];
  if (override) return override;
  const bucket = bucketOf(callingName);
  if (bucket === 'stake') return OTHER_STAKE;
  if (bucket === 'bishopric') {
    if (WARD_BISHOPRIC_ROLES.includes(callingName)) return WARD_CLERK_STYLE;
    if (BRANCH_PRESIDENCY_ROLES.includes(callingName)) return BRANCH_CLERK_STYLE;
  }
  return null;
}

/**
 * Whether the workflow needs the High Council approval step. Only true
 * for callings whose approve body is `stake_presidency_and_high_council`;
 * ward-internal callings (EQ secretary, etc.) skip the step, and callings
 * approved outside the stake (Bishop, Patriarch, new SP counselor) have
 * external approval represented separately via requiresExternalApproval.
 */
export function requiresHighCouncilApproval(callingName: string): boolean {
  return authoritiesFor(callingName)?.approve === 'stake_presidency_and_high_council';
}

/**
 * Whether the approval body sits outside this stake — First Presidency,
 * Quorum of the Twelve, or a General Authority / Area Seventy. Drives
 * the "external approval required" banner in the workflow detail view.
 */
export function requiresExternalApproval(callingName: string): boolean {
  const a = authoritiesFor(callingName);
  if (!a) return false;
  return (
    a.approve === 'first_presidency' ||
    a.approve === 'first_presidency_and_twelve' ||
    a.approve === 'quorum_of_twelve' ||
    a.approve === 'general_authority_or_area_seventy'
  );
}

/**
 * Vocabulary roles that qualify a person as a given actor. General
 * Authorities and members of the First Presidency / Twelve aren't in
 * the local roster, so their entries are empty — those actors return
 * no eligible people from `eligiblePeople`.
 */
const ACTOR_TO_ROLES: Record<Actor, readonly string[]> = {
  stake_president: ['Stake President'],
  stake_presidency_counselor: [
    'Stake Presidency First Counselor',
    'Stake Presidency Second Counselor',
  ],
  high_councilor: ['Stake High Councilor'],
  bishop: ['Bishop'],
  bishopric_counselor: ['Bishopric First Counselor', 'Bishopric Second Counselor'],
  branch_president: ['Branch President'],
  branch_presidency_counselor: [
    'Branch Presidency First Counselor',
    'Branch Presidency Second Counselor',
  ],
  quorum_president: ['Elders Quorum President'],
  quorum_presidency_counselor: [
    'Elders Quorum First Counselor',
    'Elders Quorum Second Counselor',
  ],
  stake_org_president: [
    'Stake Relief Society President',
    'Stake Young Women President',
    'Stake Primary President',
    'Stake Young Men President',
    'Stake Sunday School President',
  ],
  stake_audit_committee_chairman: ['Audit Committee Chairman'],
  general_authority_or_area_seventy: [],
  first_presidency_member_or_twelve: [],
};

/**
 * People from the roster whose current callings qualify them to act
 * as any of the given actors. When the actor list only names off-stake
 * bodies (GA/AS, First Presidency), the return is [] — the caller
 * should render an external-approval hint instead of an empty dropdown.
 */
export function eligiblePeople(
  actors: readonly Actor[],
  people: readonly Person[],
): Person[] {
  const roles = new Set<string>();
  for (const a of actors) for (const r of ACTOR_TO_ROLES[a]) roles.add(r);
  if (roles.size === 0) return [];
  return people.filter((p) => (p.callings ?? []).some((c) => roles.has(c)));
}
