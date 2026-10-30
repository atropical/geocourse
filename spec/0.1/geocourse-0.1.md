# GeoCourse specification, draft 0.1

## 1. Introduction

GeoCourse is a JSON format for one rideable cycling course: the route, its elevation, and the road along it (surface, width, bends, structures, climbs and markers). Any indoor-cycling app, trainer, route planner or editor can read and write it. It is small, self-describing and simple to parse.

How any app stores, sells, draws or serves courses is out of scope. A reference writer and validator ship with the spec; they do not define the format. The spec, schema, registry and test files live at geocourse.org.

**Design principles**

- **Self-contained.** A file is fully rideable offline. Nothing needs a lookup table, a server or an OpenStreetMap query.
- **Distance is the spine.** Everything is placed by distance along the route, so physics never depends on drawing.
- **Physics values travel with the road.** Each surface carries its own rolling resistance and grip, so two apps ride the same file the same way.
- **Real-world links are provenance, not dependencies.** OpenStreetMap ids say where data came from; the values themselves are copied in.
- **One way to say each thing.** Where a value can be derived (grade from elevation, heading from geometry), the spec says which one wins.
- **Extensible without breaking.** Readers ignore what they don't know, unless the file says an extension is required.

**Conformance.** MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are used as in RFC 2119 and RFC 8174. A *writer* produces files; a *reader* consumes them. A conforming writer produces files that pass every rule in section 8. A conforming reader accepts every such file, applies the interpretation rules in sections 2 to 6, and fails clearly on files it cannot interpret.

## 2. Model and conventions

**Distance (d).** A course is a directed path from d = 0 to d = `length`. Distance is horizontal (map) distance in metres, the same measure GPX tools and OpenStreetMap use. Grade is rise over horizontal run, so the slope angle is θ = atan(grade). A reader that moves a rider at ground speed v advances d by v · cos θ per second.

**Loops.** When `closed` is true, d wraps: position `length` is position 0, and riding on continues from the start. Ranges on a closed course MAY wrap (see 5.1).

**Units.** SI throughout: metres, seconds, metres per second, kilograms. Angles are degrees. Compass headings are clockwise from true north, 0 ≤ h < 360. Timestamps are RFC 3339 strings in UTC.

**Coordinates.** Geographic positions are WGS 84 longitude, latitude, in that order. The format stores no map projection: positions are unprojected, and a reader picks a projection only when it draws a map. Distances between geographic positions are geodesic distances on the WGS 84 ellipsoid. Elevation is metres above the EGM2008 geoid (roughly mean sea level); writers MUST NOT store ellipsoidal heights. Fictional courses use a local frame: x east, y north, in metres from an origin (see 4.1). Readers that draw in another frame, such as y up and z south, convert on load.

**Scaled integers.** Large arrays store integers, and each array declares its own `scale`: the real value is stored × `scale`. This keeps files small and lets a writer pick precision without a format change.

**Encoding.** A file is one JSON object in UTF-8 with no byte-order mark, and MUST be I-JSON (RFC 7493): no duplicate member names, no NaN or Infinity, integers within ±2⁵³. Member names are case-sensitive camelCase, except members that mirror OpenStreetMap keys, which keep OSM spelling (section 6), and $schema (section 3). File extension `.geocourse.json`. Proposed media type `application/geocourse+json`. Files MAY be sent gzip or Brotli compressed.

## 3. Course object

The root of every file. Members not listed here MUST be ignored by readers (section 7 covers extensions).

| Member | Type | Req. | Meaning |
|---|---|---|---|
| `type` | string | MUST | Always `"Course"` |
| `format` | string | MUST | Spec version, `"major.minor"`; this draft is `"0.1"` |
| `id` | string | MUST | Stable across versions, `^[a-z0-9-]{1,64}$` |
| `version` | integer | MUST | Content version, 1 or more; any change to the course raises it |
| `name` | string | MUST | Display name |
| `description` | string | MAY | Plain text |
| `length` | number | MUST | Metres, greater than 0 |
| `closed` | boolean | MUST | True for a loop |
| `created` | string | MAY | RFC 3339 |
| `authors` | array of string | MAY | People or organisations |
| `licence` | string | SHOULD | SPDX identifier, for example `"ODbL-1.0"` |
| `attribution` | array of string | MUST if any source requires it | Credits to show with the course |
| `sources` | array of Source | SHOULD | Where geometry, elevation and road data came from |
| `summary` | object | MAY | `elevationGain`, `elevationLoss`, `maxGrade`; informative only |
| `geometry` | Geometry | see 4.1 | Plan view of the route |
| `profile` | Profile | MUST | Sampled elevation, grade, heading |
| `ranges` | array of Range | MUST | Everything placed along the route |
| `osm` | object | MAY | Course-level OpenStreetMap link (section 6) |
| `extensionsUsed`, `extensionsRequired`, `extensions` |  | MAY | Section 7 |

**Source.** `{ "kind": "geometry" | "elevation" | "road", "name": string, "licence": SPDX string, "url"?: string, "retrieved"?: RFC 3339 }`. Example: elevation from Copernicus GLO-30, road data from OpenStreetMap.

**Summary.** Readers SHOULD recompute rather than trust it. When given, `elevationGain` MUST equal the sum of positive differences between consecutive elevation samples as stored, with no extra smoothing, so every app shows the same number.

**Schema.** A file MAY carry `"$schema": "https://geocourse.org/schema/0.1/geocourse.schema.json"` so editors and validators find the schema on their own. Readers MUST NOT depend on it, and MUST NOT fetch it to read a file.

## 4. Geometry and profile

Both use the same sampling rule. With step s, there are n = ceil(`length` / s) + 1 samples, and sample i sits at dᵢ = min(i · s, `length`). The last sample is always exactly at the end, even when the last stretch is shorter than s.

### 4.1 Geometry

`{ "frame", "step", "scale", "positions", "origin"? }`

- `frame`: `"wgs84"` (longitude, latitude) or `"local"` (x east, y north, metres).
- `positions`: flat integer array `[x₀, y₀, x₁, y₁, …]`, one pair per sample, × `scale`. Recommended `scale`: 1e-7 for wgs84 (about 1 cm, as in OpenStreetMap), 0.01 for local.
- `origin`: local frame only, optional `{ "lon", "lat" }`. Lets a fictional course borrow a place for weather, sun position and time zone; it does not make the course geographic.
- Between samples, position is linear. A `step` of 2 m or less is RECOMMENDED so tight bends keep their shape.
- Geometry SHOULD be present. It MUST be present when the profile has no `heading`.
- The horizontal length of the polyline from sample 0 to sample i MUST be within max(1 m, 0.5 %) of dᵢ. Distance is defined by `length` and the samples; geometry has to agree with it, not the other way round.

### 4.2 Profile

`{ "step", "elevation", "grade"?, "heading"?, "bendRadiusLimit"? }`

`step` is metres, greater than 0 and at most 50; 10 or less is RECOMMENDED. Each channel is `{ "scale": number > 0, "values": [integer, …] }` with exactly n values.

| Channel | Req. | Value | Recommended scale |
|---|---|---|---|
| `elevation` | MUST | metres above the geoid | 0.1 (decimetres) |
| `grade` | MAY | rise over run, positive uphill in the direction of travel | 0.0001 (8 % = 800) |
| `heading` | MUST if no geometry | compass degrees of travel | 0.1 |

- **Between samples** elevation and grade are linear; heading is linear along the shorter arc (359° to 1° passes through 0°).
- **Grade wins for physics.** When `grade` is present it is the riding grade and readers MUST use it for resistance, in place of the elevation slope. It MAY be smoothed, but over any 1 km its integral MUST match the change in elevation within 2 m, so climbs add up.
- **Derived grade.** When absent: gradeᵢ = (eᵢ₊₁ − eᵢ₋₁) / (dᵢ₊₁ − dᵢ₋₁), one-sided at the ends of an open course, wrapping on a closed one.
- **Heading.** When absent, it is the bearing of the geometry at d. When both exist, `heading` wins for wind and trainer data, geometry wins for drawing. Writers MUST store a heading that rounds to 360° as 0.
- `bendRadiusLimit`: metres. When given, the `bend` ranges are complete up to that radius (5.4).

## 5. Ranges

Everything about the road is a range along d.

### 5.1 Range object

`{ "type", "from", "to", "id"?, "properties"?, "osm"?, "extensions"? }`

- `from`, `to`: metres, 0 ≤ `from` ≤ `to` ≤ `length`. `from` = `to` is a point. On a closed course `from` > `to` is allowed and means the range runs through the start line.
- `properties`: the type's members below, plus any others; readers ignore unknown ones.
- `osm`: links to the OpenStreetMap elements this range came from (section 6).
- Ranges of different types overlap freely. Rules within a type are below.
- Writers SHOULD sort by `from`, then `type`. Readers MUST ignore types they don't know.

### 5.2 `surface` (MUST cover the course)

Surface ranges MUST cover [0, `length`] with no gaps and no overlaps. Physics members are REQUIRED; readers MUST use them as given and MUST NOT replace them from the OSM tags.

| Property | Req. | Meaning |
|---|---|---|
| `crr` | MUST | Rolling-resistance coefficient |
| `grip` | MUST | Tyre-on-road friction coefficient, dry tarmac about 0.8; used for both cornering and braking |
| `surface` | SHOULD | OSM value: `asphalt`, `concrete`, `paving_stones`, `sett`, `compacted`, `fine_gravel`, `gravel`, `dirt`, `grass`, `mud`, … |
| `smoothness` | MAY | OSM value: `excellent` to `impassable` |
| `tracktype` | MAY | OSM value: `grade1` to `grade5` |
| `name` | MAY | Display text, for example “Pavé sector 12” |

Typical dry values for road-bike tyres (informative, from the reference writer), with the matching OSM tags:

| Surface | OSM tags | crr | grip |
|---|---|---|---|
| Smooth tarmac | `surface=asphalt`, `smoothness=good` | 0.004 | 0.8 |
| Worn or patched tarmac | `asphalt`, `smoothness=intermediate` | 0.005 | 0.75 |
| Cracked tarmac | `asphalt`, `smoothness=bad` | 0.006 | 0.7 |
| Potholed tarmac | `asphalt`, `smoothness=very_bad` | 0.008 | 0.65 |
| Setts | `surface=sett` | 0.009 | 0.6 |
| Cobbles | `surface=unhewn_cobblestone` | 0.012 | 0.55 |
| Dirt | `surface=dirt` | 0.010 | 0.55 |
| Gravel | `surface=gravel` | 0.012 | 0.5 |
| Roots | `surface=ground`, `smoothness=bad` | 0.015 | 0.45 |
| Rock | `surface=rock` | 0.018 | 0.45 |
| Mud | `surface=mud` | 0.025 | 0.3 |
| Packed snow | `surface=snow` | 0.030 | 0.2 |

Packed snow on the road is a surface. Rain, wet roads and ice from the weather are ride conditions, not course data.

### 5.3 `road`

The way the course runs on: a road, cycle path, track or trail. Road ranges SHOULD cover the whole course; a new range starts wherever a value changes.

| Property | Req. | Meaning |
|---|---|---|
| `width` | SHOULD | Metres of usable surface, edge to edge (a two-way road: the full carriageway), > 0 |
| `widthSource` | MAY | `"osm"`, `"survey"`, `"estimated"` or `"design"` |
| `highway` | SHOULD | OSM class: `primary`, `residential`, `cycleway`, `track`, `path`, … |
| `lanes`, `name`, `ref`, `lit`, `cycleway` | MAY | Lane count, road name, road number, street lights, OSM cycleway value |

Width lets a reader draw the road at the right size, keep riders on it, and judge room for passing and drafting. It has no physics effect. OSM often has no `width` tag, so writers SHOULD estimate one and mark it `estimated`. A designed course's width is exact; mark it `design`. When width is missing, readers SHOULD assume one from `highway` (informative: primary 7 m, residential 5 m, cycleway 2.5 m, track 3 m, path 1.5 m).

### 5.4 `bend`

`radius` MUST (m, at the tightest point, > 0), `direction` MUST (`"left"` or `"right"`), `apex` MUST (d of the tightest point, within the range; where the radius stays within 1 % of its minimum over a stretch, as on a constant-radius arc, the middle of that stretch).

- **Measuring.** Resample the geometry at 1 m. Radius at d is r = 20 m ÷ |Δψ|, where Δψ is the change in heading in radians, unwrapped, between d − 10 m and d + 10 m. Every writer then measures the same bend the same way. On an open course the window is clamped at the ends: within 10 m of the start or finish, r is the clamped span ÷ |Δψ|. On a closed course the window wraps through the start.
- **Why a 20 m window.** It averages out mapping noise and still reads real bends: a 2° wobble on a straight reads as about 570 m (not a bend), a 90° junction drawn as one sharp OSM corner reads as about 13 m (close to a real junction), and hairpins read true down to about 7 m radius. Tighter hairpins read slightly wide; a 5 m hairpin reads about 6.4 m.
- **What counts.** A bend is a stretch where r stays below `bendRadiusLimit`. Writers SHOULD use 400 m. Road authorities design cycle curves for a side friction of about 0.2 to 0.3, far below the tyre limit: AASHTO asks for 27 m at 30 km/h, the UK's LTN 1/20 for 25 m, the Dutch CROW manual for 20 m. At that comfort level a 400 m bend is taken at about 110 km/h, so 400 m covers every bend a rider would ease off for, even on fast descents. When the limit is given, every such stretch MUST be listed. A stretch that turns one way and then the other is split where the direction changes, so each bend turns one way. Two bends in the same direction less than 10 m apart are one bend. Bends MUST NOT overlap.
- **Safe speed** is the reader's business. Informative: two speeds matter. The comfortable speed, v = √(0.25 · g · r), matches what road authorities design for and suits slow-down cues. The limit, v = √(grip · g · r) with grip at the apex, is where tyres slide and suits crash rules. Both apply to the whole bend so warnings come early. Unpaved surfaces need 1.5 to 2 times the radius for the same speed (ECF), which their lower grip already gives.

### 5.5 `climb`

`name` MAY, `category` MAY (`"4"`, `"3"`, `"2"`, `"1"`, `"HC"`). Gain and average grade come from the profile; readers compute them.

### 5.6 `segment`

A timed stretch for results. Range `id` MUST be present and stay the same across course versions while `from`, `to` and the road under it are unchanged; if the stretch changes, the `id` MUST change, so old times are never compared against a different road. `name` MAY.

### 5.7 `structure`

`kind` MUST: `bridge`, `tunnel` or `building_passage`. `name` MAY. For drawing, lighting and GPS-style effects; no physics effect.

### 5.8 `hazard`

`kind` MUST: `cattle_grid`, `speed_bump`, `railway_crossing`, `ford`, `gate` or an extension value. Usually a point. Readers MAY warn or slow the rider; the spec sets no physics effect.

### 5.9 `marker`

`kind` MUST: `start`, `finish`, `summit`, `sprint`, `feed`, `town`, `viewpoint`, `sign` or `info`. `name` and `text` MAY. Usually a point. An open course SHOULD have `start` at 0 and `finish` at `length`. A closed course SHOULD have `start` at 0 and MUST NOT have a `finish`: laps, and where a ride ends, are up to the reader.

## 6. OpenStreetMap linking

A range MAY name the OpenStreetMap elements it came from:

`"osm": [ { "type": "way" | "node" | "relation", "id": integer, "version"?: integer, "from"?: m, "to"?: m } ]`

`from` and `to` narrow the ref to part of the range when one range spans several ways. The root MAY carry `"osm": { "snapshot": RFC 3339, "relation"?: integer }`: the date of the OSM data used, and the route relation the course follows, if any.

**Rules**

1. **Refs are provenance.** A file MUST be fully rideable and drawable without resolving any ref.
2. **Copy, don't point.** Any value a reader needs MUST be in `properties`. Members that mirror OSM keys use the OSM key and value spelling unchanged (`surface`, `smoothness`, `tracktype`, `highway`, `width`, `lanes`, `lit`, `cycleway`). Other tags MAY be kept verbatim in a `tags` property (string to string), so a round trip loses nothing.
3. **Ids drift.** Ways split, merge and get deleted, and tags change. Writers SHOULD give `version` and the root `snapshot`. Readers MUST NOT assume a ref still exists or still has the same tags. Refreshing values from live OSM makes a new course `version`.
4. **No direction.** A ref says nothing about travel direction; an OSM way may run either way along the course.

**Tag to range mapping** (for writers):

| OSM tags | Range |
|---|---|
| `surface`, `smoothness`, `tracktype` | `surface` (writer also sets `crr`, `grip`) |
| `highway`, `name`, `ref`, `width`, `lanes`, `lit`, `cycleway` | `road` |
| `bridge=yes`, `tunnel=yes`, `tunnel=building_passage` | `structure` |
| `barrier=cattle_grid`, `traffic_calming=bump`, `railway=level_crossing`, `ford=yes`, `barrier=gate` | `hazard` (node, usually a point) |
| `natural=peak`, `place=town` or `village` | `marker` |

**Data licence.** The spec puts no licence on courses. Authors are responsible for meeting the terms of their sources. A file SHOULD state its own `licence` and carry the `attribution` its sources require; for OpenStreetMap data that is ODbL 1.0 and “© OpenStreetMap contributors”.

## 7. Extensions and versioning

**Extensions** follow the glTF pattern.

- Any object MAY carry `"extensions": { "<name>": { … } }`. Names are lowercase `vendor_feature`, for example `acme_scenery`.
- The root lists every name used in `extensionsUsed`, and the subset a reader must understand in `extensionsRequired`. A reader MUST refuse a file with a required extension it does not support, and MUST otherwise ignore extensions it does not know.
- Extension range types and `kind` values are written `vendor:name`, for example `acme:checkpoint`. Readers ignore unknown types and treat unknown kinds as plain points or ranges.
- If an extension changes how a course rides (speed, resistance, grip), it MUST be in `extensionsRequired`. Two apps must never ride the same file differently because one ignored an extension.
- Range types, `kind` values and extension names are listed in the registry at https://geocourse.org/registry, so names never collide. Anyone can request a name there.

**Versioning.** `format` is `"major.minor"`.

- A minor release only adds optional members, range types or values. A reader for major M reads every M.x file, ignoring what it doesn't know.
- A major release is needed whenever an older reader would misread a newer file. Readers MUST refuse a major they don't support.
- While major is 0 any release may break. A draft such as 0.1 may still change until it is declared released; after that it is frozen. Format 1.0 locks once two independent apps ride the same test files and get the same results.
- `format` versions the spec; the course's own `version` versions the content. They never move together.

## 8. Validation rules

A file is valid only when all of these hold. A JSON Schema (https://geocourse.org/schema/0.1/geocourse.schema.json) checks structure, types, patterns and value ranges; the reference validator checks every rule, including the counts and cross-references a schema cannot express.

1. `type` is `"Course"`; `format` matches `^\d+\.\d+$`.
2. `id` matches `^[a-z0-9-]{1,64}$`; `version` is an integer of 1 or more; `length` is finite and greater than 0.
3. `profile.step` is greater than 0 and at most 50; every channel has `scale` > 0 and exactly ceil(`length` / step) + 1 integer values.
4. `geometry`, when present, has 2 × (ceil(`length` / geometry step) + 1) integer positions; wgs84 longitudes lie within ±180 and latitudes within ±90.
5. Either `geometry` or `profile.heading` is present; headings lie in [0, 360).
6. Every range has 0 ≤ `from`, `to` ≤ `length`, and `from` ≤ `to` unless `closed` is true. Range `id`s are unique in the file.
7. Surface ranges cover [0, `length`] exactly, with no gaps or overlaps; `crr` ≥ 0, `grip` > 0.
8. Geometry length agrees with d within max(1 m, 0.5 %) at every sample.
9. When `grade` is present, its integral matches the elevation change within 2 m over every 1 km window. A window starts at every profile sample and slides by one sample; a course of 1 km or less is checked as one window; windows do not wrap on a closed course.
10. Bends have `radius` > 0 and `apex` inside the range, and do not overlap; with `bendRadiusLimit` set, none is missing: every measured bend has a listed bend in the same direction whose apex lies within the measured stretch, give or take 1 m.
11. Every `segment` has an `id`.
12. On a closed course the first and last elevation samples are equal, and the first and last geometry positions are within 1 m.
13. Every name in `extensionsRequired` is also in `extensionsUsed`.
14. `attribution` is present whenever a source licence is on the registry's attribution list. An unknown licence id is a warning, not an error.
15. A closed course has no `finish` marker.

Test files are published at https://geocourse.org/tests/0.1/: valid files a reader must accept and ride to known results (Frost Gate Traverse among them), and invalid files, one per rule, that a validator must reject.

## 9. Example

A 25 m test course at a steady 8 %, heading east. With step 10 there are four samples, at 0, 10, 20 and 25 m. Geometry uses step 10 here only to keep the example short. OSM ids are placeholders.

```json
{
  "$schema": "https://geocourse.org/schema/0.1/geocourse.schema.json",
  "type": "Course",
  "format": "0.1",
  "id": "example-ramp",
  "version": 1,
  "name": "Example ramp",
  "length": 25,
  "closed": false,
  "licence": "ODbL-1.0",
  "attribution": ["© OpenStreetMap contributors"],
  "sources": [
    { "kind": "road", "name": "OpenStreetMap", "licence": "ODbL-1.0", "retrieved": "2026-10-01T00:00:00Z" }
  ],
  "summary": { "elevationGain": 2.0, "elevationLoss": 0, "maxGrade": 0.08 },
  "geometry": {
    "frame": "wgs84",
    "step": 10,
    "scale": 1e-7,
    "positions": [107522000, 599139000, 107523792, 599139000,
                  107525584, 599139000, 107526480, 599139000]
  },
  "profile": {
    "step": 10,
    "elevation": { "scale": 0.1, "values": [1200, 1208, 1216, 1220] },
    "grade": { "scale": 0.0001, "values": [800, 800, 800, 800] },
    "heading": { "scale": 0.1, "values": [900, 900, 900, 900] },
    "bendRadiusLimit": 400
  },
  "ranges": [
    { "type": "marker", "from": 0, "to": 0, "properties": { "kind": "start" } },
    { "type": "road", "from": 0, "to": 25,
      "properties": { "highway": "tertiary", "name": "Example Road", "width": 5.5 },
      "osm": [{ "type": "way", "id": 123456789, "version": 7 }] },
    { "type": "segment", "id": "example-ramp-sprint", "from": 0, "to": 25,
      "properties": { "name": "Ramp sprint" } },
    { "type": "surface", "from": 0, "to": 25,
      "properties": { "crr": 0.004, "grip": 0.8, "surface": "asphalt", "smoothness": "good" },
      "osm": [{ "type": "way", "id": 123456789, "version": 7 }] },
    { "type": "hazard", "from": 18, "to": 18,
      "properties": { "kind": "cattle_grid" },
      "osm": [{ "type": "node", "id": 987654321 }] },
    { "type": "marker", "from": 25, "to": 25, "properties": { "kind": "finish" } }
  ],
  "osm": { "snapshot": "2026-10-01T00:00:00Z" },
  "extensionsUsed": ["acme_scenery"],
  "extensions": { "acme_scenery": { "tileSize": 512 } }
}
```

No bend ranges: the road is straight, and `bendRadiusLimit` says the list is complete. `acme_scenery` is used but not required, so a reader without it rides the course the same way.

## 10. Scope, changes and open questions

**Out of scope for the core spec**

- Storage, access control and distribution (buckets, keys, signed links, server endpoints).
- The rider physics model and game rules (crashes, braking input, drafting). A reference physics model can become an informative appendix, so apps have a shared starting point without it being mandatory.
- Assistive features: slow-down cues, brake points, racing line. Readers compute them, as racing games do, from geometry, `width`, bends and surface; the file only supplies those inputs.
- Scenery and tiles. A companion spec can define them later and point at a course by `id` and `version`; until then they ride in extensions.
- Branching routes. One file is one path.
- Multi-stage events. A companion spec can list courses in order by `id` and `version`; a course file carries no stage links.

**Changes from the current format 0** (for files written before this draft)

- `type: "Course"` added; `format` goes from the number 0 to the string `"0.1"`.
- Samples: ceil instead of floor, so the last sample sits exactly at the end.
- Channels declare their own `scale` instead of fixed units; the recommended scales match today's values.
- Geometry added (WGS 84 or local). The local frame is x east, y north, not the renderer's z south.
- `surfaces[]` and `bends[]` become ranges with an explicit `to`; `turn` becomes `direction`; `safeSpeed` leaves the core, readers compute it.
- Distance is defined as horizontal.
- `elevationGain` and `elevationLoss` move into the optional `summary`.
- `mu` and `grip` merge into one `grip`: absolute friction (dry tarmac 0.8), used for cornering and braking. Format 0's relative braking grip goes.

**Open questions**

- [ ] **Name.** GeoCourse. A web search found no clashing format or app; a formal trademark check is still due before 1.0.
- [x] **Horizontal distance.** The reference writer already measures distance horizontally and treats grade as rise over run, which matches section 2. Readers that move a rider at ground speed v advance d by v · cos θ per second (section 2); advancing by v over-counts distance by 0.3 % at 8 % and 2 % at 20 %.

### Findings from the first export (Frost Gate Traverse, 2026-10-30)

The reference writer's first export is valid under every rule of section 8: 75.6 km, 756 KB (289 KB gzip), 816 bends (format 0: 183 KB, 881 bends with an 8 m window).

- [ ] **Size.** Geometry at 2 m is 77 % of the file (582 KB, 234 KB gzip). Consider delta-encoding positions, or a step that may grow on straights.
- [x] **Bend window at the ends.** 5.4 doesn't say what happens within 10 m of the start or end of an open course. The writer clamps the window and divides by the shorter span; say so, or say the bend ends there.
- [x] **S-bends.** A stretch under the limit can turn left, then right, with no straight between. The writer splits it where the turn changes sign; the spec should say that.
- [x] **"None missing" needs a tolerance.** The validator recomputes bends from the geometry and accepts a listed bend within 1 m of each measured apex. Say how close is close enough, or validators will disagree.
- [x] **1 km windows in rule 9.** Say whether a window slides by one sample, and what a course shorter than 1 km checks (the writer uses the whole course).
- [x] **Heading rounding.** 359.96° at scale 0.1 rounds to 3600, outside [0, 360). Writers must wrap it to 0; say so in 4.2.
- [x] **Rule 14.** Resolved: the registry's attribution list decides (rule 14).
- [x] **Finish on a loop.** On a closed course a finish marker at length is the same point as 0. Say whether a loop has a finish marker, and where.
- [x] **widthSource for designed roads.** A fictional course's width is exact by design: neither osm, survey nor estimated fits. Suggest "design".

## Appendix A. GPX and FIT (informative)

For trainers and bike computers that only read GPX 1.1 or FIT course files. Both carry a track and points, not surfaces, physics or road data, so conversion loses those.

| Course | GPX 1.1 | FIT course file |
|---|---|---|
| `name` | `trk/name` | `course.name` |
| Geometry and elevation | One `trkpt` (lat, lon, ele) per geometry sample | One `record` per sample: position, altitude, `distance` |
| Distance d | Not stored; readers recompute | `record.distance`, horizontal metres |
| `marker` start, finish, info | `wpt` | `course_point` type `generic` |
| `marker` summit, sprint, feed | `wpt` with `type` | `course_point` `summit`, `sprint`, `food` |
| `climb` with category | Not carried | `course_point` `fourth_category` to `hors_category`, at the summit |
| `bend` | Not carried | `course_point` at the apex: `slight_left` / `slight_right` under 45° of turn, `left` / `right` to 120°, `sharp_left` / `sharp_right` to 160°, `u_turn` beyond |
| `hazard` | `wpt` with `type` "danger" | `course_point` `danger` |
| `surface`, `road`, physics | Lost (or a GPX extension) | Lost |

- Local-frame courses can only be exported when they have an `origin`; positions are then placed on the ground around it.
- FIT positions are semicircles: degrees × 2³¹ ÷ 180.
- Trainers that read grade from GPX recompute it from elevation, so writers SHOULD export elevation that matches the riding grade.
