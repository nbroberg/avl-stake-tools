import { Timestamp } from 'firebase/firestore';
import { HC_QUORUM_REQUIRED } from '../quorum';
import type {
  AppUser,
  CallingStatusHistoryEntry,
  CallingWorkflow,
  Person,
} from '../../models/types';

/**
 * Fixed mock dataset for demo mode. Every name, birth year, email and
 * phone number here is invented; emails use the reserved example.com
 * domain and phones the reserved 555-01xx range, so nothing in this file
 * can collide with a real person or reach a real line.
 *
 * The unit numbers ARE the real vocabulary from core/units.ts, because
 * the importer, the Scope report and the New Calling form all validate
 * against it - mock units would only exercise the failure paths.
 *
 * The data is shaped to put the UI through its paces rather than to look
 * tidy: some slots are deliberately vacant so the Scope report renders
 * its gap markers, offices vary so the New Calling form's priesthood
 * filtering has something to filter, and the workflows below sit at
 * several different points in the status ladder.
 */

// Invented unit numbers from core/demo/demo-units.ts, which replaces the
// real ward and branch vocabulary for the whole demo session.
const NORTHGATE = '900101';
const RIVERBEND = '900102';
const SILVERPINE = '900104';
const LAKEMONT = '900105';
const FAIRHAVEN = '900106';
const CEDAR_HOLLOW = '900108';

interface PersonSeed {
  name: string;
  birthYear: number;
  unit: string;
  /** LCR "Priesthood office"; '' means none on record. */
  office: string;
  callings: string[];
  email?: string;
  phone?: string;
}

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const SEEDS: PersonSeed[] = [
  // --- Stake presidency & office -------------------------------------
  // No Stake Assistant Clerk seeded: that slot renders as a gap.
  { name: 'Marcus Whitfield', birthYear: 1968, unit: NORTHGATE, office: 'High Priest',
    callings: ['Stake President'], email: 'm.whitfield@example.com', phone: '555-0110' },
  { name: 'Daniel Okafor', birthYear: 1972, unit: RIVERBEND, office: 'High Priest',
    callings: ['Stake Presidency First Counselor'], email: 'd.okafor@example.com', phone: '555-0111' },
  { name: 'Peter Alvarado', birthYear: 1975, unit: LAKEMONT, office: 'High Priest',
    callings: ['Stake Presidency Second Counselor'], email: 'p.alvarado@example.com', phone: '555-0112' },
  { name: 'Grant Sorensen', birthYear: 1981, unit: NORTHGATE, office: 'Elder',
    callings: ['Stake Executive Secretary'], email: 'g.sorensen@example.com', phone: '555-0113' },
  { name: 'Victor Ramsey', birthYear: 1964, unit: SILVERPINE, office: 'High Priest',
    callings: ['Stake Clerk'], email: 'v.ramsey@example.com' },

  // --- High council & patriarch ---------------------------------------
  { name: 'Alan Pruitt', birthYear: 1970, unit: NORTHGATE, office: 'High Priest',
    callings: ['Stake High Councilor'], email: 'a.pruitt@example.com' },
  { name: 'Reuben Castillo', birthYear: 1966, unit: RIVERBEND, office: 'High Priest',
    callings: ['Stake High Councilor'] },
  { name: 'Theodore Lindqvist', birthYear: 1959, unit: LAKEMONT, office: 'High Priest',
    callings: ['Stake High Councilor'] },
  { name: 'Samuel Boateng', birthYear: 1978, unit: FAIRHAVEN, office: 'High Priest',
    callings: ['Stake High Councilor'] },
  { name: 'Curtis Vandenberg', birthYear: 1974, unit: SILVERPINE, office: 'High Priest',
    callings: ['Stake High Councilor'] },
  { name: 'Hyrum Tafuna', birthYear: 1969, unit: CEDAR_HOLLOW, office: 'High Priest',
    callings: ['Stake High Councilor'] },
  { name: 'Isaac Berkowitz', birthYear: 1983, unit: NORTHGATE, office: 'Elder',
    callings: ['Stake High Councilor'] },
  { name: 'Owen Delacroix', birthYear: 1971, unit: RIVERBEND, office: 'High Priest',
    callings: ['Stake High Councilor'] },
  { name: 'Nathaniel Sarkisian', birthYear: 1962, unit: LAKEMONT, office: 'High Priest',
    callings: ['Stake High Councilor'] },
  { name: 'Emmanuel Rivera', birthYear: 1980, unit: FAIRHAVEN, office: 'High Priest',
    callings: ['Stake High Councilor'] },
  { name: 'Wallace Thornbury', birthYear: 1948, unit: NORTHGATE, office: 'Patriarch',
    callings: ['Patriarch'], email: 'w.thornbury@example.com' },

  // --- Stake auxiliaries ----------------------------------------------
  { name: 'Rosalind Ferreira', birthYear: 1977, unit: NORTHGATE, office: '',
    callings: ['Stake Relief Society President'], email: 'r.ferreira@example.com', phone: '555-0120' },
  { name: 'Colleen Ashby', birthYear: 1982, unit: LAKEMONT, office: '',
    callings: ['Stake Relief Society First Counselor'] },
  { name: 'Priscilla Nakamura', birthYear: 1985, unit: RIVERBEND, office: '',
    callings: ['Stake Relief Society Secretary'] },
  { name: 'Bernard Kingsley', birthYear: 1979, unit: SILVERPINE, office: 'High Priest',
    callings: ['Stake Young Men President'], email: 'b.kingsley@example.com' },
  { name: 'Trevor Amundson', birthYear: 1986, unit: FAIRHAVEN, office: 'Elder',
    callings: ['Stake Young Men First Counselor'] },
  { name: 'Delphine Marchetti', birthYear: 1984, unit: NORTHGATE, office: '',
    callings: ['Stake Young Women President'], email: 'd.marchetti@example.com' },
  { name: 'Harriet Oyelaran', birthYear: 1990, unit: CEDAR_HOLLOW, office: '',
    callings: ['Stake Young Women Second Counselor'] },
  { name: 'Meredith Calloway', birthYear: 1976, unit: RIVERBEND, office: '',
    callings: ['Stake Primary President'], email: 'm.calloway@example.com' },
  { name: 'Josephine Ibarra', birthYear: 1988, unit: LAKEMONT, office: '',
    callings: ['Stake Primary First Counselor'] },
  { name: 'Gerald Strickland', birthYear: 1965, unit: NORTHGATE, office: 'High Priest',
    callings: ['Stake Sunday School President'] },

  // --- Northgate Ward ---------------------------------------------------
  { name: 'Julian Hathaway', birthYear: 1973, unit: NORTHGATE, office: 'Bishop',
    callings: ['Bishop'], email: 'j.hathaway@example.com', phone: '555-0130' },
  { name: 'Ezra Whitcomb', birthYear: 1980, unit: NORTHGATE, office: 'High Priest',
    callings: ['Bishopric First Counselor'], email: 'e.whitcomb@example.com' },
  { name: 'Andre Beaumont', birthYear: 1987, unit: NORTHGATE, office: 'Elder',
    callings: ['Bishopric Second Counselor'] },
  { name: 'Lorenzo Pacheco', birthYear: 1991, unit: NORTHGATE, office: 'Elder',
    callings: ['Ward Executive Secretary'] },
  { name: 'Desmond Achterberg', birthYear: 1984, unit: NORTHGATE, office: 'Elder',
    callings: ['Ward Clerk'] },
  { name: 'Roland Quintero', birthYear: 1989, unit: NORTHGATE, office: 'Elder',
    callings: ['Elders Quorum President'], email: 'r.quintero@example.com', phone: '555-0131' },
  { name: 'Bartholomew Nkemdirim', birthYear: 1993, unit: NORTHGATE, office: 'Elder',
    callings: ['Elders Quorum First Counselor'] },
  { name: 'Simon Vasquez', birthYear: 1995, unit: NORTHGATE, office: 'Elder',
    callings: ['Elders Quorum Secretary'] },

  // --- Riverbend Ward -------------------------------------------------
  { name: 'Gideon Marchbanks', birthYear: 1970, unit: RIVERBEND, office: 'Bishop',
    callings: ['Bishop'], email: 'g.marchbanks@example.com' },
  { name: 'Malcolm Truesdale', birthYear: 1983, unit: RIVERBEND, office: 'Elder',
    callings: ['Bishopric First Counselor'] },
  { name: 'Vincent Abernathy', birthYear: 1979, unit: RIVERBEND, office: 'Elder',
    callings: ['Bishopric Second Counselor'] },
  { name: 'Felix Aguirre', birthYear: 1992, unit: RIVERBEND, office: 'Elder',
    callings: ['Elders Quorum President'] },
  { name: 'Clarence Wiggington', birthYear: 1988, unit: RIVERBEND, office: 'Elder',
    callings: ['Elders Quorum Second Counselor'] },

  // --- Silverpine Ward -----------------------------------------
  // Bishopric counselors deliberately absent - shows two gaps in a row.
  { name: 'Solomon Fitzgerald', birthYear: 1976, unit: SILVERPINE, office: 'Bishop',
    callings: ['Bishop'], email: 's.fitzgerald@example.com' },
  { name: 'Percival Odhiambo', birthYear: 1990, unit: SILVERPINE, office: 'Elder',
    callings: ['Ward Clerk', 'Elders Quorum First Counselor'] },
  { name: 'Augustus Lindenbaum', birthYear: 1986, unit: SILVERPINE, office: 'Elder',
    callings: ['Elders Quorum President'] },

  // --- Cedar Hollow Branch (branch presidency, no elders quorum slots) -------
  { name: 'Barnabas Kowalczyk', birthYear: 1967, unit: CEDAR_HOLLOW, office: 'High Priest',
    callings: ['Branch President'], email: 'b.kowalczyk@example.com', phone: '555-0140' },
  { name: 'Thaddeus Villanueva', birthYear: 1981, unit: CEDAR_HOLLOW, office: 'Elder',
    callings: ['Branch Presidency First Counselor'] },
  { name: 'Casimir Adeyemi', birthYear: 1994, unit: CEDAR_HOLLOW, office: 'Elder',
    callings: ['Branch Clerk'] },

  // --- Roster-only members ---------------------------------------------
  // No in-scope calling: these never appear on Scope, but they DO show up
  // as candidates on the New Calling form, which is the point.
  { name: 'Jasper Nightingale', birthYear: 1985, unit: NORTHGATE, office: 'Elder',
    callings: [], email: 'j.nightingale@example.com', phone: '555-0150' },
  { name: 'Oscar Templeton', birthYear: 1978, unit: NORTHGATE, office: 'High Priest',
    callings: [], email: 'o.templeton@example.com' },
  { name: 'Ignatius Mbeki', birthYear: 1996, unit: NORTHGATE, office: 'Priest',
    callings: [] },
  { name: 'Cornelius Rasmussen', birthYear: 1991, unit: RIVERBEND, office: 'Elder',
    callings: [], phone: '555-0151' },
  { name: 'Beatrice Lundgren', birthYear: 1987, unit: RIVERBEND, office: '',
    callings: [], email: 'b.lundgren@example.com' },
  { name: 'Genevieve Okonjo', birthYear: 1983, unit: LAKEMONT, office: '',
    callings: [] },
  { name: 'Coralie Fontaine', birthYear: 1986, unit: RIVERBEND, office: '',
    callings: [], email: 'c.fontaine@example.com', phone: '555-0152' },
  { name: 'Horatio Petrakis', birthYear: 1974, unit: LAKEMONT, office: 'High Priest',
    callings: [], email: 'h.petrakis@example.com' },
  { name: 'Leopold Chandrasekhar', birthYear: 1989, unit: CEDAR_HOLLOW, office: 'Elder',
    callings: [] },
];

function daysAgo(days: number): Timestamp {
  return Timestamp.fromDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
}

export function demoPeople(): Person[] {
  return SEEDS.map((s) => ({
    id: `${slugify(s.name)}-${s.birthYear}`,
    name: s.name,
    fullName: s.name,
    birthYear: s.birthYear,
    unit: s.unit,
    email: s.email,
    phone: s.phone,
    priesthoodOffice: s.office,
    callings: s.callings.length ? s.callings : undefined,
    active: true,
    createdAt: daysAgo(120),
    updatedAt: daysAgo(14),
  })).sort((a, b) => a.name.localeCompare(b.name));
}

/** The pretend signed-in user. Role is switchable from the demo banner. */
export const DEMO_USER: AppUser = {
  firebaseUid: 'demo-user',
  email: 'demo@example.com',
  displayName: 'Demo User',
  role: 'stake_presidency',
  active: true,
};

interface WorkflowSeed {
  id: string;
  workflowType: 'calling' | 'release';
  personName: string;
  callingName: string;
  unit?: string;
  status: string;
  ageDays: number;
  hcApprovals?: number;
  hcConcerns?: number;
  assignedTo?: string;
  notes?: string;
}

/**
 * One workflow parked at each interesting point in the ladder, so every
 * branch of the detail page (high council vote, external approval,
 * interview assignment, priesthood-office mismatch, completion) has a
 * row that reaches it.
 */
const WORKFLOW_SEEDS: WorkflowSeed[] = [
  {
    id: 'wf-eq-pres-hville',
    workflowType: 'calling',
    personName: 'Cornelius Rasmussen',
    callingName: 'Elders Quorum President',
    unit: RIVERBEND,
    status: 'proposed',
    ageDays: 2,
    notes: 'Discussed in presidency meeting; bishop concurs.',
  },
  {
    id: 'wf-bishop-marion',
    workflowType: 'calling',
    personName: 'Horatio Petrakis',
    callingName: 'Bishop',
    unit: LAKEMONT,
    status: 'presidency_approved',
    ageDays: 9,
    hcApprovals: 5,
    notes: 'Bishop calls need First Presidency approval through LCR.',
  },
  {
    // Sits exactly on the high council vote, two short of quorum, so
    // switching the demo role to High Council and approving moves the
    // count visibly. Stake organization counselors are the case that
    // needs the vote (Bishop, above, goes to the First Presidency instead).
    id: 'wf-rs-2nd-counselor',
    workflowType: 'calling',
    personName: 'Coralie Fontaine',
    callingName: 'Stake Relief Society Second Counselor',
    status: 'presidency_approved',
    ageDays: 6,
    hcApprovals: 7,
  },
  {
    // Quorum is within reach but a councilor has raised a concern, so the
    // council's own advance button stays disabled until it's cleared.
    id: 'wf-ward-clerk-riverbend',
    workflowType: 'calling',
    personName: 'Leopold Chandrasekhar',
    callingName: 'Ward Clerk',
    unit: RIVERBEND,
    status: 'presidency_approved',
    ageDays: 4,
    hcApprovals: 9,
    hcConcerns: 1,
    notes: 'Bishop asked us to confirm availability before extending.',
  },
  {
    id: 'wf-high-councilor',
    workflowType: 'calling',
    personName: 'Oscar Templeton',
    callingName: 'Stake High Councilor',
    status: 'high_council_approved',
    ageDays: 16,
  },
  {
    id: 'wf-yw-counselor',
    workflowType: 'calling',
    personName: 'Beatrice Lundgren',
    callingName: 'Stake Young Women First Counselor',
    status: 'interview_assigned',
    ageDays: 21,
    assignedTo: 'Peter Alvarado',
  },
  {
    // Priesthood-office mismatch on purpose: a Priest called to a role
    // that needs the Melchizedek Priesthood, so the detail page raises
    // its "ordination needed" banner.
    id: 'wf-ward-clerk-ash',
    workflowType: 'calling',
    personName: 'Ignatius Mbeki',
    callingName: 'Ward Clerk',
    unit: NORTHGATE,
    status: 'accepted',
    ageDays: 27,
  },
  {
    id: 'wf-release-eq-sec',
    workflowType: 'release',
    personName: 'Simon Vasquez',
    callingName: 'Elders Quorum Secretary',
    unit: NORTHGATE,
    status: 'release_extended',
    ageDays: 11,
    notes: 'Moving out of the stake at the end of the month.',
  },
  {
    id: 'wf-primary-2nd',
    workflowType: 'calling',
    personName: 'Genevieve Okonjo',
    callingName: 'Stake Primary Second Counselor',
    status: 'sustained',
    ageDays: 34,
  },
  {
    id: 'wf-eq-asst-sec',
    workflowType: 'calling',
    personName: 'Jasper Nightingale',
    callingName: 'Elders Quorum Assistant Secretary',
    unit: NORTHGATE,
    status: 'complete',
    ageDays: 68,
  },
];

export function demoWorkflows(): CallingWorkflow[] {
  const people = demoPeople();
  return WORKFLOW_SEEDS.map((s) => {
    const person = people.find((p) => p.name === s.personName);
    return {
      id: s.id,
      workflowType: s.workflowType,
      personId: person?.id ?? slugify(s.personName),
      personName: s.personName,
      callingName: s.callingName,
      unit: s.unit,
      status: s.status as CallingWorkflow['status'],
      proposedDate: daysAgo(s.ageDays),
      assignedTo: s.assignedTo,
      // Councilor UIDs are positional: demo-hc-1 is the first high
      // councilor in the roster, so demoHistory() can name them.
      hcApprovalUids: Array.from({ length: s.hcApprovals ?? 0 }, (_, i) => `demo-hc-${i + 1}`),
      hcConcernUids: Array.from(
        { length: s.hcConcerns ?? 0 },
        (_, i) => `demo-hc-${(s.hcApprovals ?? 0) + i + 1}`,
      ),
      hcRequired: HC_QUORUM_REQUIRED,
      notes: s.notes,
      createdBy: 'demo-user',
      updatedBy: 'demo-user',
      createdAt: daysAgo(s.ageDays),
      updatedAt: daysAgo(Math.max(0, s.ageDays - 2)),
    } satisfies CallingWorkflow;
  });
}

/** Demo high councilors, in roster order - demo-hc-N maps to index N-1. */
function councilorNames(): string[] {
  return SEEDS.filter((s) => s.callings.includes('Stake High Councilor')).map((s) => s.name);
}

/** The name behind a seeded councilor UID, e.g. 'demo-hc-3'. */
function councilorName(uid: string): string {
  const index = Number(uid.replace('demo-hc-', '')) - 1;
  return councilorNames()[index] ?? 'A high councilor';
}

/**
 * Seed audit trail: creation, the status transitions already passed, and
 * one entry per recorded high council vote.
 *
 * The vote entries matter beyond flavour - the detail page resolves
 * councilor UIDs to names through the history, because a client may read
 * only its own users/{uid} doc. Without these the presidency's view would
 * correctly but uselessly report "9 approvals, none named".
 */
export function demoHistory(workflow: CallingWorkflow): CallingStatusHistoryEntry[] {
  const age = workflow.createdAt ? daysSince(workflow.createdAt) : 7;
  const entries: CallingStatusHistoryEntry[] = [
    {
      id: `${workflow.id}-h0`,
      status: 'proposed',
      changedBy: 'demo-user',
      changedByName: 'Marcus Whitfield',
      changedAt: daysAgo(age),
      note: 'Workflow created.',
    },
  ];

  if (workflow.status !== 'proposed') {
    entries.push({
      id: `${workflow.id}-h1`,
      status: workflow.status,
      changedBy: 'demo-user',
      changedByName: 'Daniel Okafor',
      changedAt: daysAgo(Math.max(0, age - 3)),
    });
  }

  for (const [i, uid] of (workflow.hcApprovalUids ?? []).entries()) {
    entries.push({
      id: `${workflow.id}-hc${i}`,
      status: 'presidency_approved',
      changedBy: uid,
      changedByName: councilorName(uid),
      changedAt: daysAgo(Math.max(0, age - 4)),
      kind: 'hc_approval',
      note: 'High Council approval recorded.',
    });
  }

  for (const [i, uid] of (workflow.hcConcernUids ?? []).entries()) {
    entries.push({
      id: `${workflow.id}-hcc${i}`,
      status: 'presidency_approved',
      changedBy: uid,
      changedByName: councilorName(uid),
      changedAt: daysAgo(Math.max(0, age - 5)),
      kind: 'hc_concern',
      note: 'High Council concern raised.',
    });
  }

  return entries;
}

function daysSince(ts: Timestamp): number {
  return Math.max(0, Math.round((Date.now() - ts.toDate().getTime()) / 86_400_000));
}
