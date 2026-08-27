import type { StakeUnit } from '../units';

/**
 * Invented wards and branches for demo mode. Installed over the real
 * vocabulary at bootstrap (see demo-providers.ts) so a demo session never
 * names this stake's actual units.
 *
 * The unit numbers are made up too, drawn from a 9xxxxx block so they
 * can't collide with a real Church-issued number. The shape deliberately
 * mirrors the real list - seven wards, four branches, one of them a
 * language-group branch with a parenthetical - because that parenthetical
 * is a genuine formatting edge the Scope report has to render.
 */
export const DEMO_UNITS: readonly StakeUnit[] = [
  { number: '900101', name: 'Northgate Ward',                 kind: 'ward'   },
  { number: '900102', name: 'Riverbend Ward',                 kind: 'ward'   },
  { number: '900103', name: 'Copperfield Ward',               kind: 'ward'   },
  { number: '900104', name: 'Silverpine Ward',                kind: 'ward'   },
  { number: '900105', name: 'Lakemont Ward',                  kind: 'ward'   },
  { number: '900106', name: 'Fairhaven Ward',                 kind: 'ward'   },
  { number: '900107', name: 'Stonebridge Ward',               kind: 'ward'   },
  { number: '900108', name: 'Cedar Hollow Branch',            kind: 'branch' },
  { number: '900109', name: 'Willowmere Branch',              kind: 'branch' },
  { number: '900110', name: 'Harborview Branch',              kind: 'branch' },
  { number: '900111', name: 'Meadowlark Branch (Tagalog)',    kind: 'branch' },
];
