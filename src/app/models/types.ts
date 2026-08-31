import type { Timestamp } from 'firebase/firestore';

/**
 * POC role model. Two roles only:
 * - stake_presidency: full read/write on the calling workflow.
 * - high_council: read everything, and may only advance
 *   presidency_approved -> high_council_approved.
 *
 * Firestore Security Rules (see firestore.rules) are the authoritative
 * enforcement point for both. The helpers in core/roles.ts are UX only.
 */
export type Role = 'stake_presidency' | 'high_council';

export const ALL_ROLES: Role[] = ['stake_presidency', 'high_council'];

export const ROLE_LABELS: Record<Role, string> = {
  stake_presidency: 'Stake Presidency',
  high_council: 'High Council',
};

/** users/{firebaseUid} - the application's own authorization record. */
export interface AppUser {
  firebaseUid: string;
  email: string;
  displayName: string;
  role: Role;
  active: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

/**
 * people/{slug} - minimal local record, NOT a membership record mirror.
 *
 * The Firestore document id is a slug derived from Full Name + Birth
 * Year (e.g., `john-andrew-smith-1970`). Church-issued MRN would
 * be the truly-stable identity, but LCR's copy-paste flow doesn't
 * expose MRN reliably; Full Name changes rarely (marriage/legal
 * change), Birth Year never, so together they are stable enough for
 * a stake's population where same-name-same-year collisions are
 * astronomically unlikely.
 *
 * Only the four narrow fields (name/unit/email/phone) plus a
 * lightweight `birthYear` (integer, no day/month) and the extracted
 * in-scope callings ever land here - not any of the sensitive
 * membership data (full birthdate, ordinances, priesthood office
 * history, marriage/sealing status, etc.) that an unfiltered LCR
 * export would carry.
 */
export interface Person {
  /** Slug from Full Name + Birth Year - same as the document id. */
  id: string;
  /**
   * Display name. Comes from LCR's Preferred Name (falls back to
   * Full Name if Preferred Name isn't set). Changes freely - purely
   * cosmetic, never used for identity.
   */
  name: string;
  /**
   * Full legal name from LCR, normalized to "First Last" order.
   * Used together with birthYear to derive the doc id `id`; keep
   * both fields on the doc so a later reconciliation (e.g., after
   * a name change) can match by original identity source without
   * re-parsing the slug.
   */
  fullName: string;
  /** Year only (integer). Day/month is deliberately not stored. */
  birthYear: number;
  /**
   * Church-issued unit number (stored as a string id, not the display
   * name). See core/units.ts for the vocabulary and unitLabel() to
   * resolve to a human name.
   */
  unit: string;
  email?: string;
  phone?: string;
  /**
   * LCR "Priesthood office" column. Populated by the roster import when
   * the LCR custom report includes that column. One of "Deacon",
   * "Teacher", "Priest", "Elder", "High Priest", "Bishop", "Patriarch",
   * or the empty string (women, unordained males). Used to filter the
   * person dropdown when creating a workflow for a calling with a
   * priesthood-office requirement (see core/calling-authorities.ts).
   */
  priesthoodOffice?: string;
  /**
   * In-scope calling roles this person currently holds. Populated by the
   * LCR import; drives the /scope report. Callings outside the
   * presidency/bishopric/EQ vocabulary are dropped at parse time and
   * never land here.
   */
  callings?: string[];
  /**
   * When each of the above callings was sustained, as an ISO date
   * string (YYYY-MM-DD). Populated when the LCR export includes the
   * "Callings with Date Sustained" variant. Missing entries mean LCR
   * didn't supply the date for that role; callings not in this map
   * still show up in `callings` and render on /scope without a
   * time-in-calling display.
   */
  sustainedAt?: Record<string, string>;
  active: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type CallingWorkflowType = 'calling' | 'release';

export type CallingStatus =
  | 'proposed'
  | 'presidency_approved'
  | 'high_council_approved'
  | 'interview_assigned'
  | 'calling_extended'
  | 'accepted'
  | 'sustained'
  | 'set_apart'
  | 'recorded_in_lcr'
  | 'complete';

export type ReleaseStatus =
  | 'proposed'
  | 'presidency_approved'
  | 'release_extended'
  | 'released'
  | 'sustained'
  | 'recorded_in_lcr'
  | 'complete';

export const CALLING_STATUS_ORDER: CallingStatus[] = [
  'proposed',
  'presidency_approved',
  'high_council_approved',
  'interview_assigned',
  'calling_extended',
  'accepted',
  'sustained',
  'set_apart',
  'recorded_in_lcr',
  'complete',
];

export const RELEASE_STATUS_ORDER: ReleaseStatus[] = [
  'proposed',
  'presidency_approved',
  'release_extended',
  'released',
  'sustained',
  'recorded_in_lcr',
  'complete',
];

export const CALLING_STATUS_LABELS: Record<CallingStatus, string> = {
  proposed: 'Proposed',
  presidency_approved: 'Stake Presidency Approved',
  high_council_approved: 'High Council Approved',
  interview_assigned: 'Interview Assigned',
  calling_extended: 'Interview / Calling Extended',
  accepted: 'Accepted',
  sustained: 'Sustained',
  set_apart: 'Set Apart',
  recorded_in_lcr: 'Recorded in LCR',
  complete: 'Complete',
};

export const RELEASE_STATUS_LABELS: Record<ReleaseStatus, string> = {
  proposed: 'Proposed',
  presidency_approved: 'Stake Presidency Approved',
  release_extended: 'Release Extended',
  released: 'Released',
  sustained: 'Sustained (Thanks)',
  recorded_in_lcr: 'Recorded in LCR',
  complete: 'Complete',
};

/** callingWorkflows/{id} */
export interface CallingWorkflow {
  id: string;
  workflowType: CallingWorkflowType;
  personId: string;
  personName: string; // denormalized for list display
  callingName: string;
  /**
   * Church-issued unit number - see core/units.ts and unitLabel().
   * Omitted for stake-level callings (Stake Presidency, High Council,
   * Patriarch, stake auxiliaries), which don't belong to a ward or branch.
   */
  unit?: string;
  status: CallingStatus | ReleaseStatus;
  /**
   * Church-issued unit numbers where a stake-level calling (or release)
   * has already been sustained. Only meaningful when `unit` is omitted -
   * a stake calling has no stake conference to sustain it at, so it's
   * sustained ward-by-ward as the presidency visits each unit, and the
   * workflow can't advance to `sustained` until this covers every unit
   * in stakeUnits() (see core/units.ts). Ward/branch-level callings need
   * only their own unit's sustaining vote, which the plain status
   * transition already captures - this field stays unused for those.
   */
  sustainedInUnits?: string[];
  proposedDate?: Timestamp;
  presidencyApprovedDate?: Timestamp;
  highCouncilApprovedDate?: Timestamp;
  interviewAssignedDate?: Timestamp;
  extendedDate?: Timestamp;
  acceptedDate?: Timestamp;
  sustainedDate?: Timestamp;
  setApartDate?: Timestamp;
  recordedDate?: Timestamp;
  completedDate?: Timestamp;
  /**
   * Presidency member (or clerk) responsible for conducting the interview
   * and extending the calling. Set when the workflow advances to
   * `interview_assigned`. The Interview Assigned dropdown is filtered to
   * people who satisfy the calling's `callSetApart` authorities (see
   * core/calling-authorities.ts).
   */
  assignedTo?: string;
  /**
   * Presidency member or high councilor who set the person apart. Set
   * when the workflow advances to `set_apart`. The dropdown is filtered
   * to the same authorities as `assignedTo`. Optional (older workflows
   * completed without capturing this field).
   */
  setApartBy?: string;
  /**
   * UIDs of High Council members who have voted to approve this workflow
   * while it sits at `presidency_approved`. Populated via arrayUnion by
   * each HC member individually; presidency and HC both use size vs
   * `hcRequired` to decide whether the workflow can advance.
   *
   * A member may withdraw while the workflow is still at
   * `presidency_approved`; once it advances, votes are locked.
   */
  hcApprovalUids?: string[];
  /**
   * UIDs of High Council members who have registered a concern rather
   * than approving. A concern never blocks the arithmetic — one member
   * cannot veto a calling — but it does block the high council's own
   * quorum-advance path, so an unresolved concern has to be talked
   * through and cleared, or overridden deliberately by the presidency.
   *
   * Mutually exclusive with `hcApprovalUids` per member, enforced in
   * firestore.rules rather than only in the UI.
   */
  hcConcernUids?: string[];
  /**
   * How many HC approvals this workflow needs before advancing to
   * high_council_approved. Snapshotted at create time so mid-vote
   * changes to the quorum constants don't move the goalposts.
   */
  hcRequired?: number;
  notes?: string;
  createdBy: string;
  updatedBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

/**
 * What a history entry records, beyond the status it was written
 * against. Absent on plain status transitions; set on the high council
 * actions so the detail view can fold the trail back into "who currently
 * approves" without parsing note text.
 */
export type HistoryEntryKind =
  | 'hc_approval'
  | 'hc_withdrawal'
  | 'hc_concern'
  | 'hc_concern_cleared';

/** callingWorkflows/{id}/history/{historyId} - audit trail */
export interface CallingStatusHistoryEntry {
  id: string;
  status: string;
  changedBy: string;
  changedByName: string;
  changedAt?: Timestamp;
  note?: string;
  kind?: HistoryEntryKind;
}

/**
 * Priesthood advancement: Priest -> Elder, or Elder -> High Priest. Per
 * stake direction, the bishop is not part of this app's flow (for now) -
 * only the stake presidency proposes/approves and the high council votes,
 * the same pairing that already reviews stake-level callings. There is no
 * bishop-side interview/extend/accept/set-apart phase, so this is a
 * shorter ladder than CallingWorkflow's.
 */
export type PriesthoodAdvancementType = 'priest_to_elder' | 'elder_to_high_priest';

export const ADVANCEMENT_OFFICES: Record<
  PriesthoodAdvancementType,
  { from: string; to: string }
> = {
  priest_to_elder: { from: 'Priest', to: 'Elder' },
  elder_to_high_priest: { from: 'Elder', to: 'High Priest' },
};

export const ADVANCEMENT_TYPE_LABELS: Record<PriesthoodAdvancementType, string> = {
  priest_to_elder: 'Priest → Elder',
  elder_to_high_priest: 'Elder → High Priest',
};

export type AdvancementStatus =
  | 'proposed'
  | 'presidency_approved'
  | 'high_council_approved'
  | 'ordained'
  | 'recorded_in_lcr'
  | 'complete';

export const ADVANCEMENT_STATUS_ORDER: AdvancementStatus[] = [
  'proposed',
  'presidency_approved',
  'high_council_approved',
  'ordained',
  'recorded_in_lcr',
  'complete',
];

export const ADVANCEMENT_STATUS_LABELS: Record<AdvancementStatus, string> = {
  proposed: 'Proposed',
  presidency_approved: 'Stake Presidency Approved',
  high_council_approved: 'High Council Approved',
  ordained: 'Ordained',
  recorded_in_lcr: 'Recorded in LCR',
  complete: 'Complete',
};

/** priesthoodAdvancements/{id} */
export interface PriesthoodAdvancementWorkflow {
  id: string;
  advancementType: PriesthoodAdvancementType;
  personId: string;
  personName: string; // denormalized for list display
  /** Ward or branch unit number; omitted for a stake-level record. */
  unit?: string;
  status: AdvancementStatus;
  proposedDate?: Timestamp;
  presidencyApprovedDate?: Timestamp;
  highCouncilApprovedDate?: Timestamp;
  ordainedDate?: Timestamp;
  recordedDate?: Timestamp;
  completedDate?: Timestamp;
  /** Display name of who performed the ordination. Set when the workflow
   *  advances to `ordained`; optional, free text - there's no fixed
   *  authority list for this the way calling-authorities.ts has one for
   *  callings. */
  ordainedBy?: string;
  /**
   * UIDs of High Council members who have voted to approve this workflow
   * while it sits at `presidency_approved`. Same semantics as
   * CallingWorkflow.hcApprovalUids - see core/hc-review.ts and
   * core/advancement-review.ts.
   */
  hcApprovalUids?: string[];
  /** Same semantics as CallingWorkflow.hcConcernUids. */
  hcConcernUids?: string[];
  /** Snapshotted quorum threshold - see core/quorum.ts. */
  hcRequired?: number;
  notes?: string;
  createdBy: string;
  updatedBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

/** priesthoodAdvancements/{id}/history/{historyId} - audit trail */
export interface AdvancementHistoryEntry {
  id: string;
  status: string;
  changedBy: string;
  changedByName: string;
  changedAt?: Timestamp;
  note?: string;
  kind?: HistoryEntryKind;
}

/**
 * rosterSync/status - a single singleton doc flagging whether the
 * Firestore `people` roster is known to be behind LCR. There's no live
 * connection between this app and LCR (see core/roster-sync.ts), so this
 * is presidency-acknowledged, not auto-detected: recording a workflow in
 * LCR sets `pending: true`; the presidency clears it once they've re-run
 * the roster sync/import.
 */
export interface RosterSyncStatus {
  pending: boolean;
  lastRecordedAt?: Timestamp;
  lastRecordedBy?: string;
  clearedAt?: Timestamp;
  clearedBy?: string;
  clearedByName?: string;
}
