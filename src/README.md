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
| `R1` to `R15` | error | A rule of section 8 is broken |
| `encoding` | error | Not I-JSON (spec 2): byte-order mark, duplicate member names, integers beyond ±2⁵³, or not JSON at all |
| `structure` | error | A required member is missing or has the wrong type (sections 3 to 7), matching what the schema checks |
| `R10`, `R14` | warning | Bend completeness not checked (no geometry); a licence id not on the registry's attribution list |
| `spec` | warning | Other MUST or SHOULD text outside section 8: summary `elevationGain` not matching the samples, extensions not listed in `extensionsUsed`, unknown range types, missing start or finish markers on an open course |

Other spec text outside section 8 is reported as warnings.

## Where the spec leaves a choice open

Rule 9 windows and rule 10 measuring follow the spec as written (sections 5.4 and 8). These remaining choices are the validator's own. They will move into the spec as it settles.

- **Sample counts.** ceil(`length` / step) treats a quotient within 1 part in 10⁹ of a whole number as that number, so 0.3 / 0.1 counts as 3, not 4.
- **Distances.** Geodesic on the WGS 84 ellipsoid (spec 2), by Vincenty's inverse formula. For the rare nearly antipodal pair where Vincenty does not converge it falls back to a great-circle distance on a sphere of the ellipsoid's mean radius. Equality of distances allows 10⁻⁶ m.
- **Size limit.** Bend completeness is skipped, with a warning, on courses over 10 000 km, so a tiny file cannot force a huge resample.
- **Rule 14.** The attribution list is [`registry/attribution-licences.json`](../registry/attribution-licences.json). Only `sources[].licence` is checked.
