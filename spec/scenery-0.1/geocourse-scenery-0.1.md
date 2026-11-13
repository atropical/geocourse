# GeoCourse Scenery, draft 0.1 (outline)

- **Status:** Outline only. Scope, not a specification: nothing here is normative yet, and no file should be written against it.
- **Companion to:** [GeoCourse 0.1](../0.1/geocourse-0.1.md), section 10.
- **Licence:** this text CC BY 4.0 ([`spec/LICENSE`](../LICENSE)).

## Purpose

GeoCourse Scenery describes what is around a course, so any app can build its own world for it. It is to a renderer what OpenStreetMap data is to a map style: it says what is where, never how it looks. A course file stays rideable without it; scenery never changes how a course rides.

Scenery data only says what is where. Every app is free to draw, model, level and stream it however it wants, and a reader MAY ignore it entirely. There is no conformance requirement on rendering: conformance covers reading the data, never how it looks.

## Linking to a course

A scenery file names the course it fits by `id` and `version`, and carries its own version. Changing scenery never changes the course `version`; a new course `version` may need a new scenery file.

## In scope

- **Land shape.** A heightfield around the course in the course's frame (WGS 84 or local), with its extent, spacing and elevation datum (EGM2008, as in the course).
- **Water bodies.** Lakes, rivers and sea as outlines or areas, with a water level.
- **Ground cover.** Classes by area (for example forest, meadow, farmland, sand, rock, built-up), from a registry of class names.
- **Objects by kind and position.** Trees by species, buildings, jetties, signs and the like, each with a position, heading and size, and an optional reference to a model (an identifier or URL the app may resolve, never required to place the object).
- **Structures by type and span.** Bridges, tunnels, walls and barriers, placed by course distance (from, to) or by position, with type and dimensions.
- **Licensing per asset.** A licence (SPDX) and attribution for every data source and every referenced model.

## Out of scope

Meshes, levels of detail, shaders and looks, materials, tiling and streaming. Those belong to each app's own scenery package (Strōq's included) and are not standardised, so two apps may draw the same scenery file very differently.

## Open questions

- [ ] Heightfield encoding: scaled-integer grid as in the course profile, or a tiled raster reference.
- [ ] Registry of ground-cover classes and object kinds, and how far they follow OSM tags.
- [ ] Whether objects may also be placed by course distance and offset, not only by position.
