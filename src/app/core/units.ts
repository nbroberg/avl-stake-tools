/**
 * Units in this stake, keyed by their Church-issued unit number. The
 * unit number is the stable identity - display names can be simplified
 * or units can be reorganized/renumbered, but the number persists. See
 * `lcrName` on StakeUnit for the case where LCR's own unit text (what the
 * importer matches against) needs to keep a suffix - e.g. a language-group
 * designation like "(Pohnpeian)" - that the UI's display `name` drops.
 *
 * Analogous to using MRN as the person doc id: the number is opaque,
 * doesn't leak sensitive data, and gives clean joins across
 * collections without name-drift bugs.
 *
 * This list is the authoritative set. The LCR importer will refuse rows
 * whose unit text doesn't match one of these (by `lcrName` or `name`); the
 * New Calling form's Unit dropdown shows the display `name`.
 */
export type UnitKind = 'ward' | 'branch';

export interface StakeUnit {
  /** Church-issued unit number, stored as a string because it is an id
   *  (not an integer to do arithmetic on). */
  number: string;
  /** Display name used throughout the app's UI. */
  name: string;
  /**
   * LCR's own unit text, when it differs from the display `name` (e.g. a
   * language-group suffix like "(Pohnpeian)" that the UI intentionally
   * drops but LCR's own "Unit" column still reports). The importer's
   * unitByName() matches against this, falling back to `name` when unset,
   * so a display-only rename never breaks import matching.
   */
  lcrName?: string;
  kind: UnitKind;
}

/**
 * The stake's real units. Demo mode replaces this whole vocabulary with
 * invented units via overrideStakeUnits(), so read the active list through
 * stakeUnits() rather than importing this constant.
 */
const REAL_STAKE_UNITS: readonly StakeUnit[] = [
  { number: '139173',  name: 'Asheville Ward',                          kind: 'ward'   },
  { number: '49212',   name: 'Cherokee Ward',                           kind: 'ward'   },
  { number: '49921',   name: 'Forest City Ward',                        kind: 'ward'   },
  { number: '46442',   name: 'Hendersonville 1st Ward',                 kind: 'ward'   },
  { number: '49468',   name: 'Marion Ward',                             kind: 'ward'   },
  { number: '95494',   name: 'Waynesville Ward',                        kind: 'ward'   },
  { number: '156922',  name: 'Weaverville Ward',                        kind: 'ward'   },
  // Asheville Central Branch and Hendersonville 2nd Branch are becoming
  // wards as part of a boundary realignment - kind flipped ahead of the
  // official reorganization so the New Calling form's Unit dropdown
  // offers them for the incoming Bishop callings (unitScopeFor('Bishop')
  // filters to kind: 'ward'). Names deliberately left as "...Branch" for
  // now, matching what LCR still reports - see core/calling-authorities.ts
  // and core/callings-vocabulary.ts, neither of which reads `kind` at
  // all, so this flip has no effect on anything except that one dropdown.
  { number: '193534',  name: 'Asheville Central Branch',                kind: 'ward'   },
  { number: '188840',  name: 'Brevard Branch',                          kind: 'branch' },
  { number: '95486',   name: 'Franklin Branch',                         kind: 'branch' },
  {
    number: '1906070',
    name: 'Hendersonville 2nd Branch',
    lcrName: 'Hendersonville 2nd Branch (Pohnpeian)',
    kind: 'ward',
  },
];

let activeUnits: readonly StakeUnit[] = REAL_STAKE_UNITS;
let byNumber = new Map(activeUnits.map((u) => [u.number, u]));
let byNameLower = new Map(activeUnits.map((u) => [(u.lcrName ?? u.name).toLowerCase(), u]));

/** The active unit vocabulary - the real stake's, or demo mode's. */
export function stakeUnits(): readonly StakeUnit[] {
  return activeUnits;
}

/**
 * Swap the unit vocabulary. Demo mode uses this to replace the real
 * wards and branches with invented ones, so a demo session never puts
 * this stake's actual unit names on screen.
 *
 * Called once from the demo chunk before the app bootstraps (see
 * core/demo/demo-providers.ts); nothing else should touch it. The
 * lookup maps are rebuilt here because every function below reads
 * through them.
 */
export function overrideStakeUnits(units: readonly StakeUnit[]): void {
  activeUnits = units;
  byNumber = new Map(units.map((u) => [u.number, u]));
  byNameLower = new Map(units.map((u) => [(u.lcrName ?? u.name).toLowerCase(), u]));
}

/** Lookup by number. Returns undefined for an unknown id. */
export function unitByNumber(number: string | null | undefined): StakeUnit | undefined {
  if (!number) return undefined;
  return byNumber.get(number);
}

/** Case-insensitive name lookup, for translating LCR paste rows. */
export function unitByName(name: string | null | undefined): StakeUnit | undefined {
  if (!name) return undefined;
  return byNameLower.get(name.trim().toLowerCase());
}

/**
 * Display label for a stored unit id. Falls back to the raw id when the
 * unit isn't in the vocabulary (which shouldn't happen post-import but
 * keeps a legacy doc from rendering blank).
 */
export function unitLabel(number: string | null | undefined): string {
  if (!number) return '';
  const u = byNumber.get(number);
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
