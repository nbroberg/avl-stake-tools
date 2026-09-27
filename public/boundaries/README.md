# Unit boundary data

`units.geojson` in this folder is what `/boundary` (the public "which
ward/branch is my address in" page) matches addresses against. It is
fetched by `BoundaryService` at runtime — see
`src/app/core/boundary.service.ts` — and nothing in the application
code needs to change when this file changes.

**The committed `units.geojson` is placeholder data.** Its two features
are deliberately labeled "Sample Unit A/B (placeholder — replace with
real boundary data)" and sit over two arbitrary adjacent boxes near
Asheville — they do not represent any real ward or branch boundary.
Anyone hitting `/boundary` before this is replaced will see that label
verbatim, which is intentional: it should be obvious that real data
hasn't been loaded yet, never mistakable for a real (if wrong) answer.

## Replacing it with real boundaries

1. Obtain the current boundary KML/KMZ for each unit (stake/ward
   boundary files, as maintained by the stake clerk / mapped in LCR).
2. Convert to GeoJSON. Options:
   - [mapshaper.org](https://mapshaper.org) (drag-and-drop, no install)
   - `ogr2ogr -f GeoJSON out.geojson in.kml` (GDAL, if installed)
3. Merge into one `FeatureCollection` with one `Feature` per unit, each
   carrying at least `unitName` and `unitId` in `properties`, and a
   `Polygon` or `MultiPolygon` geometry. Optional properties:
   `meetingTime`, `meetinghouseName`, `meetinghouseAddress` — all
   optional, all read straight through by `BoundaryService` with no
   code change either way (see `UnitBoundary` in
   `src/app/core/boundary-match.ts`).
4. Validate before replacing the live file — see "Validation" below.
5. Replace this `units.geojson` and deploy as usual (`git push` to
   `main`; see `.github/workflows/deploy.yml`).

## Validation

Before publishing new boundary data, spot-check known addresses:

- one clearly inside each unit;
- addresses on both sides of any newly-moved boundary line;
- an address near (but outside) the stake boundary;
- a clearly outside-the-stake address, to confirm it reports
  "outside the stake" rather than guessing a nearby unit.

A quick way to sanity-check the file itself without deploying: open it
in [geojson.io](https://geojson.io) and confirm units don't overlap and
don't have gaps along shared boundary lines — `matchUnit` (in
`boundary-match.ts`) returns the *first* feature whose polygon contains
the point, so an accidental overlap would silently resolve to whichever
unit happens to come first in the file.
