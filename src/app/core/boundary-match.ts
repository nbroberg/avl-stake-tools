import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';
import type { Feature, FeatureCollection, GeoJsonProperties, MultiPolygon, Polygon } from 'geojson';

/**
 * The public-facing shape a matched unit is handed back as - just enough
 * to answer "which congregation, and how do I get there," never anything
 * membership-related. Every field but the two names is optional so the
 * GeoJSON can be published with minimal properties and grow richer later
 * without a schema migration (see BoundaryService's doc comment).
 *
 * `isStakeWideOption` marks a unit with no exclusive geographic area of
 * its own (e.g. a foreign-language branch open to any member in the
 * stake) - see matchUnits below.
 */
export interface UnitBoundary {
  unitName: string;
  unitId: string;
  meetingTime?: string;
  meetinghouseName?: string;
  meetinghouseAddress?: string;
  isStakeWideOption?: boolean;
}

type BoundaryProperties = Partial<Record<keyof Omit<UnitBoundary, 'isStakeWideOption'>, string>> & {
  isStakeWideOption?: boolean;
};

function toUnitBoundary(properties: GeoJsonProperties): UnitBoundary {
  const props = (properties ?? {}) as BoundaryProperties;
  return {
    unitName: props.unitName ?? 'Unknown unit',
    unitId: props.unitId ?? '',
    meetingTime: props.meetingTime,
    meetinghouseName: props.meetinghouseName,
    meetinghouseAddress: props.meetinghouseAddress,
    isStakeWideOption: props.isStakeWideOption === true,
  };
}

/**
 * Pure point-in-polygon lookup against a units GeoJSON, split out from
 * BoundaryService (which only adds fetch + caching) so it's testable
 * with a plain fixture and no Angular test bed - see
 * tests/boundaryMatch.test.ts.
 *
 * Returns `[]` when the point falls outside every geographic unit -
 * never a guess, and never a stake-wide option on its own (see below).
 * Otherwise the first element is the one geographic unit whose polygon
 * contains the point (boundaries are expected not to overlap, but if a
 * data error ever makes two overlap, this is the tie-break, and it's
 * deterministic - GeoJSON feature order), followed by every
 * `isStakeWideOption` feature in the file, unconditionally - a
 * foreign-language branch with no exclusive area of its own is a real
 * option for anyone in the stake, not something to point-in-polygon
 * test, so those features are excluded from the geographic search
 * entirely (regardless of whether they even carry a geometry - the
 * shipped data gives Hendersonville 2nd Branch a null one, valid per
 * GeoJSON's own spec for a feature with no geometry) and instead
 * appended straight through whenever a geographic match was found.
 * A feature with neither a Polygon/MultiPolygon geometry nor
 * `isStakeWideOption` set (a stray Point pin, say) is simply skipped.
 */
export function matchUnits(
  featureCollection: FeatureCollection,
  latitude: number,
  longitude: number,
): UnitBoundary[] {
  const location = point([longitude, latitude]);

  const geographic = featureCollection.features.find(
    (feature): feature is Feature<Polygon | MultiPolygon> => {
      if ((feature.properties as BoundaryProperties | null)?.isStakeWideOption === true) {
        return false;
      }
      const geometryType = feature.geometry?.type;
      if (geometryType !== 'Polygon' && geometryType !== 'MultiPolygon') return false;
      return booleanPointInPolygon(location, feature as Feature<Polygon | MultiPolygon>);
    },
  );

  if (!geographic) return [];

  const stakeWideOptions = featureCollection.features.filter(
    (feature) => (feature.properties as BoundaryProperties | null)?.isStakeWideOption === true,
  );

  return [toUnitBoundary(geographic.properties), ...stakeWideOptions.map((f) => toUnitBoundary(f.properties))];
}
