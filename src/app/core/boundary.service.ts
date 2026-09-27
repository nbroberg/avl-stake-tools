import { Injectable } from '@angular/core';
import type { FeatureCollection } from 'geojson';
import { from, map, shareReplay, type Observable } from 'rxjs';
import { matchUnit, type UnitBoundary } from './boundary-match';

export type { UnitBoundary } from './boundary-match';

/** Relative to `<base href>` so this resolves under /demo/ too - see
 *  BoundaryService's doc comment. */
const BOUNDARIES_URL = 'boundaries/units.geojson';

/**
 * Loads the stake's unit boundary polygons and answers "which unit
 * contains this point" - the only Firestore-free, unauthenticated
 * lookup in the app (see pages/boundary/boundary-lookup.component.ts).
 *
 * The GeoJSON is a static asset (public/boundaries/units.geojson,
 * served at the same path under both the root app and /demo/, since
 * Angular's asset copy is per-build), fetched once and cached for the
 * life of the page - boundary polygons don't change while someone is
 * mid-lookup, and re-fetching on every keystroke-triggered submit would
 * be wasteful. Swapping in new boundaries is a matter of replacing that
 * file and redeploying; nothing here changes.
 *
 * The actual point-in-polygon matching is the pure `matchUnit` function
 * in boundary-match.ts, kept separate so it can be unit-tested without
 * Angular or a network fetch.
 */
@Injectable({ providedIn: 'root' })
export class BoundaryService {
  private boundaries$?: Observable<FeatureCollection>;

  private loadBoundaries(): Observable<FeatureCollection> {
    if (!this.boundaries$) {
      this.boundaries$ = from(this.fetchBoundaries()).pipe(shareReplay(1));
    }
    return this.boundaries$;
  }

  private async fetchBoundaries(): Promise<FeatureCollection> {
    const response = await fetch(BOUNDARIES_URL);
    if (!response.ok) {
      throw new Error(`Failed to load unit boundaries (${response.status}).`);
    }
    return (await response.json()) as FeatureCollection;
  }

  /** The unit whose polygon contains this point, or null if it falls
   *  outside every loaded boundary. */
  findUnit(latitude: number, longitude: number): Observable<UnitBoundary | null> {
    return this.loadBoundaries().pipe(map((fc) => matchUnit(fc, latitude, longitude)));
  }
}
