# Unit boundary data

`units.geojson` in this folder is what `/boundary` (the public "which
ward/branch is my address in" page) matches addresses against. It is
fetched by `BoundaryService` at runtime — see
`src/app/core/boundary.service.ts` — and nothing in the application
code needs to change when this file changes.

## Current coverage: all 11 units

Converted from `Asheville_Stake_Boundaries_2026.kml` (see "Where this
came from" below), which carries the current, post-realignment names —
notably, two units present in an earlier KML export under old names
turned out to be the same shapes under new ones (same `unitNumber`,
identical polygon): the unit at `unitNumber: 139173` is now **French
Broad Ward** (was Asheville Ward), and `unitNumber: 193534` is now
**Cane Creek Ward** (was Asheville Central Branch). If an even later
export renames something again, checking `unitNumber` against LCR is
the way to tell a rename from a genuinely different area.

10 geographic units, each a real polygon:

- Hendersonville 1st Ward
- Forest City Ward
- French Broad Ward
- Weaverville Ward
- Brevard Branch
- Cane Creek Ward
- Cherokee Ward
- Marion Ward
- Waynesville Ward
- Franklin Branch

Plus **Hendersonville 2nd Ward**, which is *not* a geographic unit —
see below.

## Hendersonville 2nd Ward: a stake-wide option, not an area

Hendersonville 2nd Ward is a Pohnpeian-language congregation with no
exclusive geographic area — a member's assignment there doesn't depend
on their address the way it does for the other 10 units, so it can't
be represented as a polygon to test a point against. In
`units.geojson` it's a `Feature` with `"geometry": null` (valid per
the GeoJSON spec, RFC 7946 §3.2) and `"properties": { ...,
"isStakeWideOption": true }`.

`matchUnits` (in `src/app/core/boundary-match.ts`) treats
`isStakeWideOption` features specially:

- They're **excluded from the primary point-in-polygon search** —
  never point-tested, never returned as the geographic match, even if
  someone later gives one an actual geometry by mistake.
- Whenever a primary (geographic) match **is** found, every
  `isStakeWideOption` feature is appended after it, unconditionally —
  so `/boundary` always shows Hendersonville 2nd Ward as a second
  option below whichever ward/branch geography actually matched.
- If **no** geographic unit matches (the point is outside the stake),
  the result is `[]` — nothing is shown, not even the stake-wide
  option. Being outside the stake outweighs being open to any member
  *in* the stake.

If a future unit needs the same treatment (another language branch, a
YSA branch not tied to an area, etc.), give it the same
`isStakeWideOption: true` + `geometry: null` shape and it picks up
this behavior with no other code change.

## Where this came from

Converted from a KML export (10 `<Placemark>` elements, one closed
`Polygon` ring each, `<description>` carrying `unitNumber` /
`boundaryUnitId` / `layer` — both carried through into each feature's
`properties` as `unitNumber` / `churchBoundaryUnitId`) using a
one-off Python script: parse each Placemark, drop the KML altitude
value from every `lon,lat,alt` coordinate triple, normalize each ring
to counter-clockwise winding, slugify the name into `unitId`.
Hendersonville 2nd Ward was appended by hand as the `geometry: null`
stake-wide-option feature described above — it has no Placemark of its
own in the KML. No `meetingTime`/`meetinghouseName`/
`meetinghouseAddress` were in the source for any of the 11 units, so
those optional properties are simply absent for now (see
`UnitBoundary` in `src/app/core/boundary-match.ts` — every field but
the two names is optional, read straight through with no code change
needed if/when they're added).

Validated three ways before publishing:
- Each geographic unit's own centroid (average vertex position)
  resolves back to that same unit via the real `matchUnits` code path,
  with Hendersonville 2nd Ward appended after it — codified as the
  `it.each` block in `tests/boundaryData.test.ts`.
- A ~1km-spaced grid (26,559 points) across the 10 geographic units'
  combined bounding box found zero points matching more than one
  polygon.
- A point far outside the stake resolves to `[]`, not to
  Hendersonville 2nd Ward on its own.

None of these replace real address-level validation (see below) before
the *next* update — they only confirm this particular file parses
cleanly and its geographic polygons don't overlap each other.

## Replacing/extending this file

1. Obtain the current boundary KML/KMZ for each unit (stake/ward
   boundary files, as maintained by the stake clerk / mapped in LCR).
2. Convert to GeoJSON. Options:
   - [mapshaper.org](https://mapshaper.org) (drag-and-drop, no install)
   - `ogr2ogr -f GeoJSON out.geojson in.kml` (GDAL, if installed)
3. Merge into one `FeatureCollection` with one `Feature` per
   geographic unit, each carrying at least `unitName` and `unitId` in
   `properties`, and a `Polygon` or `MultiPolygon` geometry. Optional
   properties: `meetingTime`, `meetinghouseName`,
   `meetinghouseAddress`. A unit with no exclusive area of its own
   (like Hendersonville 2nd Ward) instead gets `geometry: null` and
   `isStakeWideOption: true` — see above.
4. Validate before replacing the live file — see "Validation" below.
5. Replace this `units.geojson`, update `tests/boundaryData.test.ts`
   (its centroid map and/or the stake-wide-option name), and deploy as
   usual (`git push` to `main`; see `.github/workflows/deploy.yml`).

## Validation

Before publishing new boundary data, spot-check known addresses:

- one clearly inside each unit;
- addresses on both sides of any newly-moved boundary line;
- an address near (but outside) the stake boundary;
- a clearly outside-the-stake address, to confirm it reports
  "outside the stake" rather than guessing a nearby unit.

A quick way to sanity-check the file itself without deploying: open it
in [geojson.io](https://geojson.io) and confirm units don't overlap and
don't have gaps along shared boundary lines — `matchUnits` (in
`boundary-match.ts`) returns the *first* feature whose polygon contains
the point, so an accidental overlap would silently resolve to whichever
unit happens to come first in the file.
