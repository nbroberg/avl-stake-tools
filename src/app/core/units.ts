/**
 * Units in this stake, keyed by their Church-issued unit number. The
 * unit number is the stable identity - names get changed when units
 * are reorganized, renumbered, or renamed for language groups (e.g.
 * the Pohnpeian branch's parenthetical), but the number persists.
 *
 * Analogous to using MRN as the person doc id: the number is opaque,
 * doesn't leak sensitive data, and gives clean joins across
 * collections without name-drift bugs.
 *
 * This list is the authoritative set. The LCR importer will refuse
 * rows whose unit name doesn't match one of these; the New Calling
 * form's Unit dropdown reads directly from it.
 */
export type UnitKind = 'ward' | 'branch';

export interface StakeUnit {
  /** Church-issued unit number, stored as a string because it is an id
   *  (not an integer to do arithmetic on). */
  number: string;
  /** Human-readable name as it appears in LCR reports. */
  name: string;
  kind: UnitKind;
}

export const STAKE_UNITS: StakeUnit[] = [
  { number: '139173',  name: 'Asheville Ward',                          kind: 'ward'   },
  { number: '49212',   name: 'Cherokee Ward',                           kind: 'ward'   },
  { number: '49921',   name: 'Forest City Ward',                        kind: 'ward'   },
  { number: '46442',   name: 'Hendersonville 1st Ward',                 kind: 'ward'   },
  { number: '49468',   name: 'Marion Ward',                             kind: 'ward'   },
  { number: '95494',   name: 'Waynesville Ward',                        kind: 'ward'   },
  { number: '156922',  name: 'Weaverville Ward',                        kind: 'ward'   },
  { number: '193534',  name: 'Asheville Central Branch',                kind: 'branch' },
  { number: '188840',  name: 'Brevard Branch',                          kind: 'branch' },
  { number: '95486',   name: 'Franklin Branch',                         kind: 'branch' },
  { number: '1906070', name: 'Hendersonville 2nd Branch (Pohnpeian)',   kind: 'branch' },
];

const BY_NUMBER = new Map(STAKE_UNITS.map((u) => [u.number, u]));
const BY_NAME_LOWER = new Map(STAKE_UNITS.map((u) => [u.name.toLowerCase(), u]));

/** Lookup by number. Returns undefined for an unknown id. */
export function unitByNumber(number: string | null | undefined): StakeUnit | undefined {
  if (!number) return undefined;
  return BY_NUMBER.get(number);
}

/** Case-insensitive name lookup, for translating LCR paste rows. */
export function unitByName(name: string | null | undefined): StakeUnit | undefined {
  if (!name) return undefined;
  return BY_NAME_LOWER.get(name.trim().toLowerCase());
}

/**
 * Display label for a stored unit id. Falls back to the raw id when the
 * unit isn't in the vocabulary (which shouldn't happen post-import but
 * keeps a legacy doc from rendering blank).
 */
export function unitLabel(number: string | null | undefined): string {
  if (!number) return '';
  const u = BY_NUMBER.get(number);
  return u ? u.name : number;
}

/** True when a stored unit id resolves to a branch. */
export function isBranchUnit(number: string | null | undefined): boolean {
  return unitByNumber(number)?.kind === 'branch';
}

/**
 * Display for a workflow's scope: a unit label when the workflow belongs
 * to a ward or branch, or "Stake" when the workflow has no unit (stake
 * callings, high council, patriarch, stake auxiliaries).
 */
export function workflowScopeLabel(number: string | null | undefined): string {
  if (!number) return 'Stake';
  return unitLabel(number);
}
