import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { matchUnits } from '../src/app/core/boundary-match';
import type { FeatureCollection } from 'geojson';

// Guards the REAL published boundary data (public/boundaries/units.geojson),
// as opposed to boundaryMatch.test.ts's synthetic fixture, which only
// exercises matchUnits's logic in isolation. This catches a future edit
// (a bad hand-tweak, a broken re-export) that leaves the file unparsable
// or drops/misplaces a unit, without needing a browser or a deployment
// to find out.
//
// The centroid points below are each geographic unit's average vertex
// position (see the conversion notes in public/boundaries/README.md) - a
// reasonable interior point for the real, non-self-intersecting
// ward/branch shapes currently in the file, not a substitute for the
// address-level spot checks that README also calls for before a real
// deploy.
const GEOJSON_PATH = 'public/boundaries/units.geojson';

const EXPECTED_UNIT_CENTROIDS: Record<string, [latitude: number, longitude: number]> = {
  'Hendersonville 1st Ward': [35.2515, -82.4777],
  'Forest City Ward': [35.4093, -81.9468],
  'French Broad Ward': [35.5126, -82.5937],
  'Weaverville Ward': [35.7972, -82.6611],
  'Brevard Branch': [35.1328, -82.7466],
  'Cane Creek Ward': [35.6159, -82.4586],
  'Cherokee Ward': [35.4272, -83.4138],
  'Marion Ward': [35.973, -82.1085],
  'Waynesville Ward': [35.5448, -83.0484],
  'Franklin Branch': [35.1615, -83.5028],
};

// Hendersonville 2nd Ward is a foreign-language congregation with no
// exclusive geographic area of its own (see public/boundaries/README.md)
// - represented with a null geometry and isStakeWideOption: true, so it
// never wins the primary point-in-polygon search and instead gets
// appended after whichever geographic unit does match, for every point
// inside the stake.
const STAKE_WIDE_OPTION_NAME = 'Hendersonville 2nd Ward';

function loadRealBoundaries(): FeatureCollection {
  return JSON.parse(readFileSync(GEOJSON_PATH, 'utf8')) as FeatureCollection;
}

describe('public/boundaries/units.geojson (real data)', () => {
  it('parses as a FeatureCollection with every expected unit present', () => {
    const fc = loadRealBoundaries();
    expect(fc.type).toBe('FeatureCollection');
    const names = fc.features.map((f) => f.properties?.['unitName']).sort();
    const expected = [...Object.keys(EXPECTED_UNIT_CENTROIDS), STAKE_WIDE_OPTION_NAME].sort();
    expect(names).toEqual(expected);
  });

  it('Hendersonville 2nd Ward is a stake-wide option, not a geographic unit', () => {
    const fc = loadRealBoundaries();
    const feature = fc.features.find((f) => f.properties?.['unitName'] === STAKE_WIDE_OPTION_NAME);
    expect(feature?.properties?.['isStakeWideOption']).toBe(true);
    expect(feature?.geometry).toBeNull();
  });

  it.each(Object.entries(EXPECTED_UNIT_CENTROIDS))(
    '%s: its own centroid resolves back to itself, with the stake-wide option alongside it',
    (unitName, [latitude, longitude]) => {
      const fc = loadRealBoundaries();
      const [primary, ...rest] = matchUnits(fc, latitude, longitude);
      expect(primary?.unitName).toBe(unitName);
      expect(rest.map((u) => u.unitName)).toEqual([STAKE_WIDE_OPTION_NAME]);
    },
  );

  it('a point far outside the stake matches no unit at all (not even the stake-wide option)', () => {
    const fc = loadRealBoundaries();
    expect(matchUnits(fc, 40, -80)).toEqual([]);
  });
});
