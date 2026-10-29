# GeoCourse registry

The registry lists the names GeoCourse files use, so names never collide (spec 7). Each list is a JSON file, published at `https://geocourse.org/registry/<file>`.

| File | Lists |
|---|---|
| [`range-types.json`](range-types.json) | Range types (spec 5) |
| [`kinds.json`](kinds.json) | `kind` values for `structure`, `hazard` and `marker` (spec 5.7 to 5.9) |
| [`extensions.json`](extensions.json) | Extension names and vendor prefixes (spec 7) |
| [`attribution-licences.json`](attribution-licences.json) | SPDX licence ids that make `attribution` required (rule 14) |

## Naming

- Core range types and `kind` values are lowercase, with no prefix. Only the spec adds them.
- Extension range types and `kind` values are `vendor:name`, for example `acme:checkpoint`.
- Extension names are `vendor_feature`, for example `acme_scenery`.
- `vendor` is your organisation or project, lowercase letters and digits. The vendor `acme` is reserved for examples and test files.

## Request a name

1. Check the lists above for your vendor prefix and name.
2. Open a request at https://geocourse.org/request/ with the name, what it is (range type, `kind` value, extension or licence), a one-paragraph description, and a link to its documentation if public.
3. A maintainer checks the spelling rules and collisions, and adds the entry in a pull request. The first request for a vendor prefix reserves it for the requester; later names under that prefix come from the same vendor.

The registry is dedicated to the public domain under CC0 1.0 ([`LICENSE`](LICENSE)).

Registering a name does not make it part of the spec. Names in the registry never change meaning and are never reused.
