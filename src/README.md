# Reference validator

`geocourse-validate` checks GeoCourse 0.1 files against every rule in section 8 of the spec, including the counts and cross-references the JSON Schema cannot express. It has no runtime dependencies.

```sh
geocourse-validate [--json] [--quiet] file.geocourse.json [more files]
```

Files ending in `.gz` are decompressed first. Exit status: 0 all valid, 1 at least one invalid, 2 usage or read error.

As a library:

```ts
import { validateText } from "geocourse";
const { valid, issues } = validateText(text);
```

## What it reports

| Code | Severity | Meaning |
|---|---|---|
| `R1` to `R14` | error | A rule of section 8 is broken |
| `encoding` | error | Not I-JSON (spec 2): byte-order mark, duplicate member names, integers beyond ±2⁵³, or not JSON at all |
| `structure` | error | A required member is missing or has the wrong type (sections 3 to 7), matching what the schema checks |
| `R10`, `R14` | warning | Bend completeness not checked (no geometry); a licence id not on the registry's attribution list |
| `spec` | warning | Other MUST or SHOULD text outside section 8: summary `elevationGain` not matching the samples, extensions not listed in `extensionsUsed`, unknown range types, missing start or finish markers on an open course |

Section 8 alone decides validity, so spec text outside it is reported as warnings.

## Where the spec leaves a choice open

These follow the reference writer or the open questions in section 10 of the spec. They will move into the spec as it settles.

- **Sample counts.** ceil(`length` / step) treats a quotient within 1 part in 10⁹ of a whole number as that number, so 0.3 / 0.1 counts as 3, not 4.
- **Distances.** Geodesic on the WGS 84 ellipsoid (spec 2), by Vincenty's inverse formula. For the rare nearly antipodal pair where Vincenty does not converge it falls back to a great-circle distance on a sphere of the ellipsoid's mean radius. Equality of distances allows 10⁻⁶ m.
- **Rule 9 windows.** A 1 km window starts at every profile sample and slides by one sample. A course of 1 km or less checks the whole course as one window. Windows do not wrap on a closed course.
- **Rule 10 measuring.** As spec 5.4: geometry resampled at 1 m by d, heading change between the tangents at d − 10 m and d + 10 m. Within 10 m of the ends of an open course the window is clamped and divided by the shorter span. A stretch is split where the turn changes sign. Same-direction stretches less than 10 m apart are joined.
- **Rule 10 "none is missing".** Each measured stretch needs a listed bend in the same direction whose `apex` lies inside the stretch, widened by 1 m at each end. Matching the apex to within 1 m of the measured tightest point does not work: on an arc of constant radius, centimetre rounding moves the tightest point anywhere along the arc.
- **Rule 14.** The attribution list is [`registry/attribution-licences.json`](../registry/attribution-licences.json). Only `sources[].licence` is checked.
