import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';

/**
 * The public-facing shape a matched unit is handed back as - just enough
 * to answer "which congregation, and how do I get there," never anything
 * membership-related. Every field but the two names is optional so the
 * GeoJSON can be published with minimal properties and grow richer later
 * without a schema migration (see BoundaryService's doc comment).
 */
export interface UnitBoundary {
  unitName: string;
  unitId: string;
  meetingTime?: string;
  meetinghouseName?: string;
  meetinghouseAddress?: string;
}

type BoundaryProperties = Partial<Record<keyof UnitBoundary, string>>;

/**
 * Pure point-in-polygon lookup against a units GeoJSON, split out from
 * BoundaryService (which only adds fetch + caching) so it's testable
 * with a plain fixture and no Angular test bed - see
 * tests/boundaryMatch.test.ts.
 *
 * Only Polygon/MultiPolygon features are considered; anything else in
 * the collection (a stray Point pin, say) is skipped rather than
 * thrown on, so a boundary file can carry incidental non-polygon
 * features without breaking the lookup. The first feature whose
 * polygon contains the point wins - boundaries are expected not to
 * overlap, but if a data error ever makes two overlap, this is the
 * tie-break, and it's deterministic (GeoJSON feature order).
 */
export function matchUnit(
  featureCollection: FeatureCollection,
  latitude: number,
  longitude: number,
): UnitBoundary | null {
  const location = point([longitude, latitude]);

  const match = featureCollection.features.find(
    (feature): feature is Feature<Polygon | MultiPolygon, BoundaryProperties> => {
      const geometryType = feature.geometry?.type;
      if (geometryType !== 'Polygon' && geometryType !== 'MultiPolygon') return false;
      return booleanPointInPolygon(location, feature as Feature<Polygon | MultiPolygon>);
    },
  );

  if (!match) return null;

  const props = match.properties ?? {};
  return {
    unitName: props.unitName ?? 'Unknown unit',
    unitId: props.unitId ?? '',
    meetingTime: props.meetingTime,
    meetinghouseName: props.meetinghouseName,
    meetinghouseAddress: props.meetinghouseAddress,
  };
}
