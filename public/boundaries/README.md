# Unit boundary data

`units.geojson` in this folder is what `/boundary` (the public "which
ward/branch is my address in" page) matches addresses against. It is
fetched by `BoundaryService` at runtime — see
`src/app/core/boundary.service.ts` — and nothing in the application
code needs to change when this file changes.

## Current coverage: 6 of 11 units

`units.geojson` was converted (see "Where this came from" below) from
a KML export covering **6 of the stake's 11 units**:

- Hendersonville 1st Ward
- Forest City Ward
- Asheville Ward
- Weaverville Ward
- Brevard Branch
- Asheville Central Branch

**Still missing — an address in any of these areas currently reports
"outside the stake," which is wrong, not just incomplete:**

- Cherokee Ward
- Marion Ward
- Waynesville Ward
- Franklin Branch
- Hendersonville 2nd Branch

`tests/boundaryData.test.ts` asserts both lists against the real file
(and will fail loudly, on purpose, the moment one of the "missing"
names shows up in it without the test being updated) — see that file
for what to change when one of these is added.

**Hendersonville 2nd Branch needs a design decision, not just a
polygon.** It was described (by whoever supplied the source KML) as
having no boundary of its own — its assigned area *is* the whole stake
boundary, overlapping every other unit's area rather than sitting
alongside it. `matchUnit` returns the *first* feature whose polygon
contains the point (see below), so if this unit is ever added as an
ordinary feature:
- Placed **last** in the `features` array, it only wins for a point
  that falls inside the outer stake boundary but outside every other
  unit's polygon (a real gap in the other 10 units' coverage, or
  someone genuinely assigned there rather than by address) — probably
  the right placement.
- Placed anywhere earlier, it would swallow every address in the
  entire stake, since its polygon contains all of them.

If it turns out members are assigned to it for a non-geographic reason
(language, singles status, etc.) rather than genuinely "whichever
address isn't claimed by another unit," a plain point-in-polygon match
can't represent that at all — `/boundary` would need a way to say "we
can't determine this from your address alone; contact the stake"
rather than silently naming a unit.

## Where this came from

Converted from a KML export (6 `<Placemark>` elements, one closed
`Polygon` ring each, `<description>` carrying `unitNumber` /
`boundaryUnitId` / `layer` — both carried through into each feature's
`properties` as `unitNumber` / `churchBoundaryUnitId`) using a
one-off Python script: parse each Placemark, drop the KML altitude
value from every `lon,lat,alt` coordinate triple, normalize each ring
to counter-clockwise winding, slugify the name into `unitId`. No
`meetingTime`/`meetinghouseName`/`meetinghouseAddress` were in the
source KML, so those optional properties are simply absent for all 6
units for now (see `UnitBoundary` in `src/app/core/boundary-match.ts`
— every field but the two names is optional, read straight through
with no code change needed if/when they're added).

Validated with two checks (not committed as scripts — one-off, run
against whatever the next update produces):
- Each unit's own centroid (average vertex position) resolves back to
  that same unit via the real `matchUnit` code path — codified as the
  `it.each` block in `tests/boundaryData.test.ts`.
- A ~1km-spaced grid (14,522 points) across the 6 units' combined
  bounding box found zero points matching more than one polygon.

Neither check replaces real address-level validation (see below)
before the *next* update - they only confirm this particular file
parses cleanly and its 6 polygons don't overlap each other.

## Replacing/extending this file

1. Obtain the current boundary KML/KMZ for each remaining unit
   (stake/ward boundary files, as maintained by the stake clerk /
   mapped in LCR).
2. Convert to GeoJSON. Options:
   - [mapshaper.org](https://mapshaper.org) (drag-and-drop, no install)
   - `ogr2ogr -f GeoJSON out.geojson in.kml` (GDAL, if installed)
3. Merge into one `FeatureCollection` with one `Feature` per unit, each
   carrying at least `unitName` and `unitId` in `properties`, and a
   `Polygon` or `MultiPolygon` geometry. Optional properties:
   `meetingTime`, `meetinghouseName`, `meetinghouseAddress`.
4. Validate before replacing the live file — see "Validation" below.
5. Replace this `units.geojson`, update `tests/boundaryData.test.ts`
   (add the new unit's centroid; remove it from the "still missing"
   list), and deploy as usual (`git push` to `main`; see
   `.github/workflows/deploy.yml`).

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
