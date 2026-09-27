import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { matchUnit } from '../src/app/core/boundary-match';
import type { FeatureCollection } from 'geojson';

// Guards the REAL published boundary data (public/boundaries/units.geojson),
// as opposed to boundaryMatch.test.ts's synthetic fixture, which only
// exercises matchUnit's logic in isolation. This catches a future edit
// (a bad hand-tweak, a broken re-export) that leaves the file unparsable
// or drops/misplaces a unit, without needing a browser or a deployment
// to find out.
//
// The centroid points below are each unit's average vertex position (see
// the conversion notes in public/boundaries/README.md) - a reasonable
// interior point for the real, non-self-intersecting ward/branch shapes
// currently in the file, not a substitute for the address-level spot
// checks that README also calls for before a real deploy.
const GEOJSON_PATH = 'public/boundaries/units.geojson';

const EXPECTED_UNIT_CENTROIDS: Record<string, [latitude: number, longitude: number]> = {
  'Hendersonville 1st Ward': [35.2515, -82.4777],
  'Forest City Ward': [35.4093, -81.9468],
  'Asheville Ward': [35.5126, -82.5937],
  'Weaverville Ward': [35.7972, -82.6611],
  'Brevard Branch': [35.1328, -82.7466],
  'Asheville Central Branch': [35.6159, -82.4586],
};

function loadRealBoundaries(): FeatureCollection {
  return JSON.parse(readFileSync(GEOJSON_PATH, 'utf8')) as FeatureCollection;
}

describe('public/boundaries/units.geojson (real data)', () => {
  it('parses as a FeatureCollection with every expected unit present', () => {
    const fc = loadRealBoundaries();
    expect(fc.type).toBe('FeatureCollection');
    const names = fc.features.map((f) => f.properties?.['unitName']).sort();
    expect(names).toEqual(Object.keys(EXPECTED_UNIT_CENTROIDS).sort());
  });

  it.each(Object.entries(EXPECTED_UNIT_CENTROIDS))(
    '%s: its own centroid resolves back to itself',
    (unitName, [latitude, longitude]) => {
      const fc = loadRealBoundaries();
      const result = matchUnit(fc, latitude, longitude);
      expect(result?.unitName).toBe(unitName);
    },
  );

  it('a point far outside the stake matches no unit', () => {
    const fc = loadRealBoundaries();
    expect(matchUnit(fc, 40, -80)).toBeNull();
  });

  // NOT yet in the file - see public/boundaries/README.md's coverage
  // note. Once one of these is added, move its name from here to
  // EXPECTED_UNIT_CENTROIDS above (with a real interior point) so this
  // suite starts covering it too.
  it('documents which stake units are still missing from this file', () => {
    const fc = loadRealBoundaries();
    const present = new Set(fc.features.map((f) => f.properties?.['unitName']));
    const stillMissing = [
      'Cherokee Ward',
      'Marion Ward',
      'Waynesville Ward',
      'Franklin Branch',
      'Hendersonville 2nd Branch',
    ];
    for (const name of stillMissing) {
      expect(present.has(name)).toBe(false);
    }
  });
});
