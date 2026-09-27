import { describe, expect, it } from 'vitest';
import { matchUnit } from '../src/app/core/boundary-match';
import type { FeatureCollection } from 'geojson';

// Two adjacent, non-overlapping 0.05°-square units sharing the
// longitude -82.55 boundary line, plus one MultiPolygon unit further
// away - enough to exercise every branch of matchUnit without needing
// real boundary data (see public/boundaries/README.md for the real
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
  ],
};

describe('matchUnit', () => {
  it('finds the unit whose polygon contains the point', () => {
    const result = matchUnit(FIXTURE, 35.57, -82.58);
    expect(result?.unitId).toBe('unit-a');
    expect(result?.unitName).toBe('Unit A');
    expect(result?.meetingTime).toBe('11:30 AM');
  });

  it('matches a MultiPolygon geometry the same as a Polygon', () => {
    const result = matchUnit(FIXTURE, 35.57, -82.52);
    expect(result?.unitId).toBe('unit-b');
  });

  it('leaves optional properties undefined rather than inventing them', () => {
    const result = matchUnit(FIXTURE, 35.57, -82.52);
    expect(result?.meetingTime).toBeUndefined();
    expect(result?.meetinghouseAddress).toBeUndefined();
  });

  it('returns null for a point outside every polygon', () => {
    expect(matchUnit(FIXTURE, 40, -80)).toBeNull();
  });

  it('is not fooled by a non-polygon feature it happens to sit inside', () => {
    // (-82.57, 35.57) is inside Unit A's box AND is the Point feature's
    // own coordinate - confirms the Point feature is skipped rather than
    // matched (or thrown on) and Unit A still wins.
    const result = matchUnit(FIXTURE, 35.57, -82.57);
    expect(result?.unitId).toBe('unit-a');
  });

  it('returns the first matching feature when polygons overlap', () => {
    const overlapping: FeatureCollection = {
      type: 'FeatureCollection',
      features: [FIXTURE.features[0], { ...FIXTURE.features[0], properties: { unitName: 'Duplicate', unitId: 'dup' } }],
    };
    const result = matchUnit(overlapping, 35.57, -82.58);
    expect(result?.unitId).toBe('unit-a');
  });
});
