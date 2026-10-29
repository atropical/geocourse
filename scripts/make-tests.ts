// SPDX-License-Identifier: Apache-2.0

// Writes tests/0.1: the valid files, one invalid file per rule of section 8,
// and manifest.json. Run with `npm run make-tests`. The example is taken from
// section 9 of the spec as published, so the two can never drift apart.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const out = join(root, "tests", "0.1");
type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Pretty JSON with arrays of numbers kept on one line. */
function format(v: Json, indent = ""): string {
  const next = indent + "  ";
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x !== "object" || x === null)) return `[${v.map((x) => JSON.stringify(x)).join(", ")}]`;
    return `[\n${v.map((x) => next + format(x, next)).join(",\n")}\n${indent}]`;
  }
  if (v !== null && typeof v === "object") {
    const entries = Object.entries(v);
    if (entries.length === 0) return "{}";
    return `{\n${entries.map(([k, x]) => `${next}${JSON.stringify(k)}: ${format(x, next)}`).join(",\n")}\n${indent}}`;
  }
  return JSON.stringify(v);
}

const clone = <T>(x: T): T => structuredClone(x);

// Section 9 example, verbatim.
const spec = readFileSync(join(root, "spec", "0.1", "geocourse-0.1.md"), "utf8");
const block = spec.slice(spec.indexOf("## 9. Example")).match(/```json\n([\s\S]*?)\n```/);
if (!block) throw new Error("section 9 example not found in the spec");
const exampleText = block[1] + "\n";
const example: Json = JSON.parse(exampleText);

// A closed local-frame track: 100 m straights joined by two left-hand
// semicircles of radius 30 m, ridden anticlockwise from the south-west
// corner. Built so its bends are known exactly.
function stadium(): Json {
  const R = 30, S = 100;
  const length = 2 * S + 2 * Math.PI * R;
  const at = (d: number): [number, number] => {
    const arc = Math.PI * R;
    if (d <= S) return [d, 0];
    d -= S;
    if (d <= arc) { const a = d / R; return [S + R * Math.sin(a), R - R * Math.cos(a)]; }
    d -= arc;
    if (d <= S) return [S - d, 2 * R];
    d -= S;
    const a = d / R;
    return [-R * Math.sin(a), R + R * Math.cos(a)];
  };
  const n = Math.ceil(length) + 1;
  const positions: number[] = [];
  for (let i = 0; i < n; i++) {
    const [x, y] = at(Math.min(i, length));
    positions.push(Math.round(x * 100), Math.round(y * 100));
  }
  // The loop closes exactly on its first position.
  positions[2 * (n - 1)] = positions[0];
  positions[2 * (n - 1) + 1] = positions[1];
  const pn = Math.ceil(length / 10) + 1;
  const arc1 = [S, S + Math.PI * R], arc2 = [2 * S + Math.PI * R, length];
  const r1 = (x: number) => Math.round(x * 100) / 100;
  return {
    $schema: "https://geocourse.org/schema/0.1/geocourse.schema.json",
    type: "Course",
    format: "0.1",
    id: "test-stadium-loop",
    version: 1,
    name: "Stadium loop",
    description: "Test course: a closed 388 m track with two 30 m left-hand bends, one of them through the start line.",
    length,
    closed: true,
    licence: "CC0-1.0",
    geometry: { frame: "local", step: 1, scale: 0.01, positions, origin: { lon: 10.75, lat: 59.91 } },
    profile: {
      step: 10,
      elevation: { scale: 0.1, values: new Array(pn).fill(1000) },
      bendRadiusLimit: 400,
    },
    ranges: [
      { type: "marker", from: 0, to: 0, properties: { kind: "start" } },
      { type: "road", from: 0, to: length, properties: { highway: "cycleway", width: 4, widthSource: "survey" } },
      { type: "surface", from: 0, to: length, properties: { crr: 0.004, grip: 0.8, surface: "asphalt", smoothness: "good" } },
      { type: "bend", id: "bend-north", from: arc1[0] - 10, to: r1(arc1[1] + 10), properties: { radius: 30, direction: "left", apex: r1((arc1[0] + arc1[1]) / 2) } },
      { type: "bend", id: "bend-south", from: r1(arc2[0] - 10), to: 10, properties: { radius: 30, direction: "left", apex: r1((arc2[0] + arc2[1]) / 2) } },
    ],
  };
}

/** An open local-frame course from straights and arcs: [length] or [length, radius, "left" | "right"]. */
function pieces(id: string, name: string, description: string, parts: [number, number?, ("left" | "right")?][], bends: Json[]): Json {
  const length = parts.reduce((s, p) => s + p[0], 0);
  const at = (d: number): [number, number] => {
    let x = 0, y = 0, h = Math.PI / 2; // heading east, as a compass angle
    for (const [len, R, dir] of parts) {
      const t = Math.min(d, len);
      if (!R) { x += t * Math.sin(h); y += t * Math.cos(h); }
      else {
        const s = dir === "right" ? 1 : -1, a = (s * t) / R;
        x += s * R * (Math.cos(h) - Math.cos(h + a));
        y += s * R * (Math.sin(h + a) - Math.sin(h));
        h += a;
      }
      d -= t;
      if (d <= 0) break;
    }
    return [x, y];
  };
  const n = Math.ceil(length) + 1;
  const positions: number[] = [];
  for (let i = 0; i < n; i++) {
    const [x, y] = at(Math.min(i, length));
    positions.push(Math.round(x * 100), Math.round(y * 100));
  }
  return {
    $schema: "https://geocourse.org/schema/0.1/geocourse.schema.json",
    type: "Course", format: "0.1", id, version: 1, name, description, length, closed: false, licence: "CC0-1.0",
    geometry: { frame: "local", step: 1, scale: 0.01, positions },
    profile: { step: 10, elevation: { scale: 0.1, values: new Array(Math.ceil(length / 10) + 1).fill(500) }, bendRadiusLimit: 400 },
    ranges: [
      { type: "marker", from: 0, to: 0, properties: { kind: "start" } },
      { type: "road", from: 0, to: length, properties: { highway: "cycleway", width: 3, widthSource: "design" } },
      { type: "surface", from: 0, to: length, properties: { crr: 0.004, grip: 0.8, surface: "asphalt" } },
      ...bends,
      { type: "marker", from: length, to: length, properties: { kind: "finish" } },
    ],
  };
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const q = (R: number) => (Math.PI * R) / 2; // quarter-circle arc length
// Left 90° bend straight into a right 90° bend, radius 30 m, no straight between.
const sBend = pieces("test-s-bend", "S-bend", "Test course: a 30 m left bend straight into a 30 m right bend, split where the turn changes direction.",
  [[100], [q(30), 30, "left"], [q(30), 30, "right"], [100]],
  [
    { type: "bend", from: 90, to: r2(100 + q(30)), properties: { radius: 30, direction: "left", apex: r2(100 + q(30) / 2) } },
    { type: "bend", from: r2(100 + q(30)), to: r2(110 + 2 * q(30)), properties: { radius: 30, direction: "right", apex: r2(100 + 1.5 * q(30)) } },
  ]);
// Starts on a 30 m right bend, so the window is clamped at d = 0.
const clamped = pieces("test-bend-at-start", "Bend at the start", "Test course: starts on a 30 m right bend, measured with the window clamped at the start.",
  [[q(30), 30, "right"], [100]],
  [{ type: "bend", from: 0, to: r2(q(30) + 10), properties: { radius: 30, direction: "right", apex: r2(q(30) / 2) } }]);

interface Case {
  file: string;
  valid: boolean;
  rule?: number;
  /** Defaults to R<rule>. */
  code?: string;
  message?: string;
  description: string;
  course?: Json;
  text?: string;
}

const loop = stadium();
const ranges = (c: Json, type: string) => c.ranges.find((r: Json) => r.type === type);
const mutate = (base: Json, f: (c: Json) => void) => {
  const c = clone(base);
  f(c);
  return c;
};

const cases: Case[] = [
  { file: "valid/example-ramp.geocourse.json", valid: true, description: "The example from section 9: 25 m at a steady 8 %, heading east.", text: exampleText },
  { file: "valid/stadium-loop.geocourse.json", valid: true, description: "Closed local-frame loop with two 30 m bends, one wrapping through the start line.", course: loop },
  { file: "valid/s-bend.geocourse.json", valid: true, description: "A left bend straight into a right bend, listed as two bends split where the direction changes.", course: sBend },
  { file: "valid/bend-at-start.geocourse.json", valid: true, description: "An open course that starts on a bend, measured with the window clamped at the start.", course: clamped },
  {
    file: "invalid/01-type.geocourse.json", valid: false, rule: 1, message: 'type must be "Course"',
    description: 'type is "course", not "Course".', course: mutate(example, (c) => { c.type = "course"; }),
  },
  {
    file: "invalid/02-id.geocourse.json", valid: false, rule: 2, message: "id must match",
    description: "id has upper-case letters and an underscore.", course: mutate(example, (c) => { c.id = "Example_Ramp"; }),
  },
  {
    file: "invalid/03-channel-count.geocourse.json", valid: false, rule: 3, message: "expected ceil(length / step) + 1 = 4 values",
    description: "Elevation has 3 values; floor instead of ceil drops the sample at the end.",
    course: mutate(example, (c) => { c.profile.elevation.values.pop(); }),
  },
  {
    file: "invalid/04-geometry-count.geocourse.json", valid: false, rule: 4, message: "expected 2 × (ceil(length / step) + 1) = 8 positions",
    description: "Geometry has 3 positions instead of 4.",
    course: mutate(example, (c) => { c.geometry.positions.splice(-2, 2); }),
  },
  {
    file: "invalid/05-no-heading.geocourse.json", valid: false, rule: 5, message: "either geometry or profile.heading",
    description: "Neither geometry nor profile.heading is present.",
    course: mutate(example, (c) => { delete c.geometry; delete c.profile.heading; delete c.profile.bendRadiusLimit; }),
  },
  {
    file: "invalid/05-heading-360.geocourse.json", valid: false, rule: 5, message: "heading 360° is outside [0, 360)",
    description: "A heading stored as 3600 at scale 0.1; writers must store it as 0.",
    course: mutate(example, (c) => { c.profile.heading.values[3] = 3600; }),
  },
  {
    file: "invalid/06-range-past-end.geocourse.json", valid: false, rule: 6, message: "is outside [0, length",
    description: "A hazard at 30 m on a 25 m course.",
    course: mutate(example, (c) => { const h = ranges(c, "hazard"); h.from = 30; h.to = 30; }),
  },
  {
    file: "invalid/07-surface-gap.geocourse.json", valid: false, rule: 7, message: "surface gap from 20 to length 25",
    description: "Surface ranges stop at 20 m.",
    course: mutate(example, (c) => { ranges(c, "surface").to = 20; }),
  },
  {
    file: "invalid/08-geometry-length.geocourse.json", valid: false, rule: 8, message: "geometry length disagrees with d",
    description: "The last position is 5 m too far east.",
    course: mutate(example, (c) => { c.geometry.positions[6] += 896; }),
  },
  {
    file: "invalid/09-grade-integral.geocourse.json", valid: false, rule: 9, message: "grade integral differs from elevation change",
    description: "Grade says 20 % while elevation climbs 8 %.",
    course: mutate(example, (c) => { c.profile.grade.values = [2000, 2000, 2000, 2000]; }),
  },
  {
    file: "invalid/10-missing-bend.geocourse.json", valid: false, rule: 10, message: "missing left bend",
    description: "The stadium loop with its north bend left out, while bendRadiusLimit says the list is complete.",
    course: mutate(loop, (c) => { c.ranges = c.ranges.filter((r: Json) => r.id !== "bend-north"); }),
  },
  {
    file: "invalid/11-segment-id.geocourse.json", valid: false, rule: 11, message: "segment has no id",
    description: "A segment without an id.",
    course: mutate(example, (c) => { delete ranges(c, "segment").id; }),
  },
  {
    file: "invalid/12-loop-elevation.geocourse.json", valid: false, rule: 12, message: "first and last elevation samples differ",
    description: "The stadium loop ends 0.1 m higher than it starts.",
    course: mutate(loop, (c) => { c.profile.elevation.values[c.profile.elevation.values.length - 1] = 1001; }),
  },
  {
    file: "invalid/13-required-extension.geocourse.json", valid: false, rule: 13, message: 'required extension "acme_wind" is not in extensionsUsed',
    description: "extensionsRequired names an extension missing from extensionsUsed.",
    course: mutate(example, (c) => { c.extensionsRequired = ["acme_wind"]; }),
  },
  {
    file: "invalid/14-attribution.geocourse.json", valid: false, rule: 14, message: "requires attribution",
    description: "OpenStreetMap data (ODbL-1.0) with no attribution.",
    course: mutate(example, (c) => { delete c.attribution; }),
  },
  {
    file: "invalid/15-finish-on-loop.geocourse.json", valid: false, rule: 15, message: "a closed course must not have a finish marker",
    description: "The stadium loop with a finish marker; a closed course has none.",
    course: mutate(loop, (c) => { c.ranges.push({ type: "marker", from: 0, to: 0, properties: { kind: "finish" } }); }),
  },
];

rmSync(join(out, "valid"), { recursive: true, force: true });
rmSync(join(out, "invalid"), { recursive: true, force: true });
mkdirSync(join(out, "valid"), { recursive: true });
mkdirSync(join(out, "invalid"), { recursive: true });
for (const c of cases) writeFileSync(join(out, c.file), c.text ?? format(c.course) + "\n");

const manifest = {
  format: "0.1",
  description: "GeoCourse 0.1 test files. A validator must accept every valid file and reject every invalid one with an error of the given code (R1 to R15, the rules of section 8); message is a substring of the reference validator's error.",
  pending: [{ file: "valid/frost-gate-traverse.geocourse.json", description: "Frost Gate Traverse, 75.6 km: first export from the reference writer, to be added." }],
  tests: cases.map(({ file, valid, rule, code, message, description }) => ({ file, valid, ...(valid ? {} : { ...(rule ? { rule } : {}), code: code ?? `R${rule}`, message }), description })),
};
writeFileSync(join(out, "manifest.json"), format(manifest) + "\n");
console.log(`wrote ${cases.length} test files and manifest.json to ${out}`);
