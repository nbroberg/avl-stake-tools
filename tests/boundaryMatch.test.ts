import { describe, expect, it } from 'vitest';
import { matchUnits } from '../src/app/core/boundary-match';
import type { FeatureCollection } from 'geojson';

// Two adjacent, non-overlapping 0.05°-square units sharing the
// longitude -82.55 boundary line, a MultiPolygon unit further away,
// and a stake-wide option with no geometry of its own (mirrors
// Hendersonville 2nd Ward in the real data - a foreign-language
// congregation open to any member in the stake, not tied to an area) -
// enough to exercise every branch of matchUnits without needing real
// boundary data (see public/boundaries/README.md for the real
// pipeline).
const FIXTURE: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        unitName: 'Unit A',
        unitId: 'unit-a',
        meetingTime: '11:30 AM',
        meetinghouseAddress: '1 Unit A Way',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-82.6, 35.55],
            [-82.55, 35.55],
            [-82.55, 35.6],
            [-82.6, 35.6],
            [-82.6, 35.55],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { unitName: 'Unit B', unitId: 'unit-b' },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [-82.55, 35.55],
              [-82.5, 35.55],
              [-82.5, 35.6],
              [-82.55, 35.6],
              [-82.55, 35.55],
            ],
          ],
        ],
      },
    },
    // Non-polygon feature mixed in - must be skipped, not thrown on.
    {
      type: 'Feature',
      properties: { unitName: 'Not a real unit', unitId: 'not-a-unit' },
      geometry: { type: 'Point', coordinates: [-82.57, 35.57] },
    },
    // Stake-wide option - no geometry, never point-tested, appended
    // after the primary match whenever there is one.
    {
      type: 'Feature',
      properties: {
        unitName: 'Foreign Language Branch',
        unitId: 'foreign-language-branch',
        isStakeWideOption: true,
      },
      geometry: null,
    },
  ],
};

describe('matchUnits', () => {
  it('finds the unit whose polygon contains the point, with the stake-wide option after it', () => {
    const [primary, ...rest] = matchUnits(FIXTURE, 35.57, -82.58);
    expect(primary.unitId).toBe('unit-a');
    expect(primary.unitName).toBe('Unit A');
    expect(primary.meetingTime).toBe('11:30 AM');
    expect(rest).toEqual([
      expect.objectContaining({ unitId: 'foreign-language-branch', isStakeWideOption: true }),
    ]);
  });

  it('matches a MultiPolygon geometry the same as a Polygon', () => {
    const [primary] = matchUnits(FIXTURE, 35.57, -82.52);
    expect(primary.unitId).toBe('unit-b');
  });

  it('leaves optional properties undefined rather than inventing them', () => {
    const [primary] = matchUnits(FIXTURE, 35.57, -82.52);
    expect(primary.meetingTime).toBeUndefined();
    expect(primary.meetinghouseAddress).toBeUndefined();
  });

  it('returns no units at all for a point outside every polygon, even though a stake-wide option exists', () => {
    expect(matchUnits(FIXTURE, 40, -80)).toEqual([]);
  });

  it('is not fooled by a non-polygon feature it happens to sit inside', () => {
    // (-82.57, 35.57) is inside Unit A's box AND is the Point feature's
    // own coordinate - confirms the Point feature is skipped rather than
    // matched (or thrown on) and Unit A still wins.
    const [primary] = matchUnits(FIXTURE, 35.57, -82.57);
    expect(primary.unitId).toBe('unit-a');
  });

  it('returns the first matching feature when polygons overlap', () => {
    const overlapping: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        FIXTURE.features[0],
        { ...FIXTURE.features[0], properties: { unitName: 'Duplicate', unitId: 'dup' } },
      ],
    };
    const [primary] = matchUnits(overlapping, 35.57, -82.58);
    expect(primary.unitId).toBe('unit-a');
  });

  it('never treats a stake-wide option as the primary geographic match', () => {
    // A collection with ONLY a stake-wide option (no geographic units at
    // all) must never resolve to it as if it were an area-based match -
    // the whole point of isStakeWideOption is that it isn't one.
    const onlyStakeWide: FeatureCollection = {
      type: 'FeatureCollection',
      features: [FIXTURE.features[3]],
    };
    expect(matchUnits(onlyStakeWide, 35.57, -82.58)).toEqual([]);
  });
});
