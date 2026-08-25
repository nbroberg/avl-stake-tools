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
 * people/{mrn} - minimal local record, NOT a membership record mirror.
 *
 * The Firestore document ID is the person's membership record number
 * (MRN) rather than a random id, because MRN is the only stable
 * identity across name changes (marriage, spelling corrections) and
 * ward reorganizations. Only the number itself is stored - not any of
 * the other membership data (birthdate, ordinances, priesthood office
 * history) that a full LCR export would carry.
 */
export interface Person {
  /** The MRN - same as the document ID. */
  id: string;
  name: string;
  /**
   * Church-issued unit number (stored as a string id, not the display
   * name). See core/units.ts for the vocabulary and unitLabel() to
   * resolve to a human name.
   */
  unit: string;
  email?: string;
  phone?: string;
  /**
   * In-scope calling roles this person currently holds. Populated by the
   * LCR import; drives the /scope report. Callings outside the
   * presidency/bishopric/EQ vocabulary are dropped at parse time and
   * never land here.
   */
  callings?: string[];
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
   * `interview_assigned`.
   */
  assignedTo?: string;
  /**
   * UIDs of High Council members who have voted to approve this workflow
   * while it sits at `presidency_approved`. Populated via arrayUnion by
   * each HC member individually; presidency and HC both use size vs
   * `hcRequired` to decide whether the workflow can advance.
   */
  hcApprovalUids?: string[];
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

/** callingWorkflows/{id}/history/{historyId} - audit trail */
export interface CallingStatusHistoryEntry {
  id: string;
  status: string;
  changedBy: string;
  changedByName: string;
  changedAt?: Timestamp;
  note?: string;
}
