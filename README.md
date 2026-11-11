# GeoCourse

GeoCourse is a proposed open standard for cycling courses: road, height, surface and scenery in one file. It is free to implement, and no app owns it.

| | |
|---|---|
| **Title** | GeoCourse: a format for rideable cycling courses |
| **Version** | 0.1 (draft) |
| **Status** | Proposed open standard, draft for comment |
| **This version** | https://geocourse.org/spec/0.1/ |
| **Latest version** | https://geocourse.org/spec/ |
| **Maintainer** | Atropical, which makes Strōq |
| **Licence** | Spec CC BY 4.0; schema and tools Apache-2.0; test files and registry CC0 1.0. Implementing it is royalty-free. |
| **Feedback** | Issues at https://geocourse.org/feedback/ |
| **Changes** | Proposed by issue, then pull request; see [Contributing](CONTRIBUTING.md#process) |

GeoCourse is a JSON format for one rideable cycling course: the route, its elevation, and the road along it — surface, width, bends, structures, climbs and markers — with the physics values a simulator needs. Any indoor-cycling app, smart trainer, route planner or editor can read and write it.

## Why

No open format carries a rideable course together with the road data physics needs. GPX and FIT carry a track and points, but no surfaces, bends or grip, so two apps riding the same GPX file give different results. Each indoor-cycling app keeps its own closed course format, so courses cannot move between apps and every app redoes the same road-data work.

GeoCourse puts the road into the file. Everything is placed by distance along the route, each surface carries its own rolling resistance and grip, and a file is fully rideable offline with no lookups. OpenStreetMap ids are kept as provenance, never as dependencies.

## Who it is for

- **Indoor-cycling apps and trainers** that want to ride courses from anywhere, the same way every time.
- **Route planners and editors** that want to export a course with its road data intact.
- **Course authors** who want their work to outlive any one app.

## Status

**Proposed open standard, draft 0.1, open for comment.** While the major version is 0, any release may break. GeoCourse becomes a stable 1.0 only after two independent implementations ride the same test files with the same results and a public comment period has closed. No standards body has endorsed it; see [Contributing](CONTRIBUTING.md#process) for how it is run.

## Implementations

| Implementation | Role | Notes |
|---|---|---|
| Strōq app | Reader | Rides GeoCourse files indoors, with grade, surface and bends driving the trainer |
| Strōq World Studio | Writer | Course editor; exports GeoCourse files |
| [Reference validator](src/README.md) | Validator | In this repository |

Strōq started GeoCourse and both Strōq entries come from the same maker, so they count as one implementation for 1.0. To add yours, open an issue or a pull request against this table with the name, role (reader, writer or both), a link, and the spec version it follows.

## Contents

| Path | What |
|---|---|
| [`spec/0.1/`](https://geocourse.org/spec/0.1/) | The specification |
| [`schema/0.1/geocourse.schema.json`](https://geocourse.org/schema/0.1/geocourse.schema.json) | JSON Schema 2020-12: structure, types, patterns and value ranges |
| [`src/`](src/README.md) | Reference validator (TypeScript, no runtime dependencies) and the `geocourse-validate` CLI |
| [`tests/0.1/`](https://geocourse.org/tests/0.1/) | Valid and invalid test files with a manifest of expected results |
| [`registry/`](https://geocourse.org/registry/) | Range types, `kind` values, extension names and the attribution licence list |

A draft such as 0.1 may still change until it is declared released. After that it is frozen, and fixes go into a new version.

## Validate a file

Requires Node.js 22 or later.

```sh
npm install
npm run build
node dist/src/cli.js my-course.geocourse.json
```

Linked or installed as a package, the same command is `geocourse-validate my-course.geocourse.json`. Add `--json` for machine-readable output. The exit status is 0 when every file is valid, 1 when any is invalid, 2 on a usage or read error.

## Links

- Spec: https://geocourse.org/spec/0.1/
- Schema: https://geocourse.org/schema/0.1/geocourse.schema.json
- Registry and name requests: https://geocourse.org/registry/
- Test files: https://geocourse.org/tests/0.1/
- Source: https://geocourse.org/source/
- Feedback and change proposals: https://geocourse.org/feedback/
- [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

## Licence

Implementing GeoCourse is royalty-free. The spec is CC BY 4.0, the schema and tools Apache-2.0, and the test files CC0.

Full texts: [`spec/LICENSE`](spec/LICENSE) (CC BY 4.0), [`LICENSE`](LICENSE) (Apache-2.0), [`tests/LICENSE`](tests/LICENSE) (CC0 1.0). The registry lists are CC0 1.0 too ([`registry/LICENSE`](registry/LICENSE)).

## Origin

Strōq started GeoCourse and uses it, but no app owns it. Atropical maintains the repository and the site until there are enough implementers to share that work.
