// SPDX-License-Identifier: Apache-2.0

import attributionLicences from "../registry/attribution-licences.json" with { type: "json" };
import { geodesicDistance, localOffset } from "./geodesy.js";
import { parseIJson } from "./json.js";

export type Severity = "error" | "warning";

export interface Issue {
  severity: Severity;
  /** Rule number in spec section 8, when the issue breaks one. */
  rule?: number;
  /** "R1" to "R15" for section 8 rules, "encoding" for spec 2, "structure" for the shape of sections 3 to 7, "spec" for other spec text. */
  code: string;
  /** JSON Pointer to the offending value. */
  path: string;
  message: string;
}

export interface Result {
  valid: boolean;
  issues: Issue[];
}

/** Tolerances the spec leaves open; see src/README.md. */
export const TOLERANCE = {
  /** Metres. Equality of distances written as JSON decimals. */
  distance: 1e-6,
  /** Fraction. Sample-count quotient length / step taken as an integer when this close. */
  quotient: 1e-9,
  /** Metres. A listed bend matches a measured stretch when its apex lies inside the stretch widened by this much. */
  apex: 1,
  /** Points. Bend completeness is not checked above this many 1 m resample points (10 000 km). */
  maxResample: 10_000_000,
} as const;

const CORE_TYPES = new Set(["surface", "road", "bend", "climb", "segment", "structure", "hazard", "marker"]);
const KINDS: Record<string, string[]> = {
  structure: ["bridge", "tunnel", "building_passage"],
  hazard: ["cattle_grid", "speed_bump", "railway_crossing", "ford", "gate"],
  marker: ["start", "finish", "summit", "sprint", "feed", "town", "viewpoint", "sign", "info"],
};
const VENDOR_VALUE = /^[a-z0-9]+:[a-z0-9_]+$/;
const EXTENSION_NAME = /^[a-z0-9]+_[a-z0-9_]+$/;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/i;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isIntArray = (v: unknown): v is number[] => Array.isArray(v) && v.every((x) => Number.isInteger(x));

/** Number of samples for a course length and a step (spec 4). */
export function sampleCount(length: number, step: number): number {
  const q = length / step;
  const r = Math.round(q);
  return (Math.abs(q - r) <= TOLERANCE.quotient * Math.max(1, q) ? r : Math.ceil(q)) + 1;
}

/** Distance of sample i (spec 4). */
const sampleD = (i: number, step: number, length: number) => Math.min(i * step, length);

export function validateText(text: string): Result {
  const { value, problems } = parseIJson(text);
  const issues: Issue[] = problems.map((message) => ({ severity: "error", code: "encoding", path: "", message }));
  if (value === undefined) return { valid: false, issues };
  const r = validate(value);
  issues.push(...r.issues);
  return { valid: !issues.some((i) => i.severity === "error"), issues };
}

export function validate(course: unknown): Result {
  const v = new Validator();
  v.run(course);
  const issues = v.issues.sort((a, b) => (a.rule ?? 99) - (b.rule ?? 99));
  return { valid: !issues.some((i) => i.severity === "error"), issues };
}

interface Range {
  index: number;
  type: string;
  from: number;
  to: number;
  id?: string;
  props: Obj;
}

class Validator {
  issues: Issue[] = [];
  private c: Obj = {};
  private length = NaN;
  private closed = false;

  private err(rule: number | undefined, path: string, message: string) {
    this.issues.push({ severity: "error", rule, code: rule ? `R${rule}` : "structure", path, message });
  }
  private warn(code: string, path: string, message: string) {
    this.issues.push({ severity: "warning", code, path, message });
  }

  run(course: unknown) {
    if (!isObj(course)) {
      this.err(undefined, "", "the root is not a JSON object");
      return;
    }
    this.c = course;
    this.structure();
    this.rule1();
    this.rule2();
    // Rules 3 onwards need a usable length.
    if (!(isNum(this.length) && this.length > 0)) return;
    const profileOk = this.rule3();
    const geometryOk = this.rule4();
    this.rule5();
    const ranges = this.rule6();
    this.rule7(ranges);
    if (geometryOk) this.rule8();
    if (profileOk) this.rule9();
    this.rule10(ranges, geometryOk);
    this.rule11(ranges);
    this.rule12(profileOk, geometryOk);
    this.rule13();
    this.rule14();
    this.otherSpecText(ranges, profileOk);
  }

  /** Shape of sections 3 to 7 that the rules do not name: required members and their types. */
  private structure() {
    const c = this.c;
    for (const k of ["name"]) if (typeof c[k] !== "string") this.err(undefined, `/${k}`, `${k} must be a string`);
    if (typeof c.closed !== "boolean") this.err(undefined, "/closed", "closed must be a boolean");
    else this.closed = c.closed;
    if (!isObj(c.profile)) this.err(undefined, "/profile", "profile must be an object");
    if (!Array.isArray(c.ranges)) this.err(undefined, "/ranges", "ranges must be an array");
    for (const k of ["description", "licence"])
      if (k in c && typeof c[k] !== "string") this.err(undefined, `/${k}`, `${k} must be a string`);
    for (const k of ["authors", "attribution"])
      if (k in c && !(Array.isArray(c[k]) && (c[k] as unknown[]).every((x) => typeof x === "string")))
        this.err(undefined, `/${k}`, `${k} must be an array of strings`);
    if ("created" in c && !(typeof c.created === "string" && RFC3339.test(c.created)))
      this.err(undefined, "/created", "created must be an RFC 3339 timestamp");
    if ("sources" in c) {
      if (!Array.isArray(c.sources)) this.err(undefined, "/sources", "sources must be an array");
      else
        c.sources.forEach((s, i) => {
          const p = `/sources/${i}`;
          if (!isObj(s)) return this.err(undefined, p, "a source must be an object");
          if (!["geometry", "elevation", "road"].includes(s.kind as string))
            this.err(undefined, `${p}/kind`, 'kind must be "geometry", "elevation" or "road"');
          if (typeof s.name !== "string") this.err(undefined, `${p}/name`, "name must be a string");
          if (typeof s.licence !== "string") this.err(undefined, `${p}/licence`, "licence must be an SPDX string");
          if ("retrieved" in s && !(typeof s.retrieved === "string" && RFC3339.test(s.retrieved)))
            this.err(undefined, `${p}/retrieved`, "retrieved must be an RFC 3339 timestamp");
        });
    }
    if (isObj(c.osm) && "snapshot" in c.osm && !(typeof c.osm.snapshot === "string" && RFC3339.test(c.osm.snapshot)))
      this.err(undefined, "/osm/snapshot", "snapshot must be an RFC 3339 timestamp");
    for (const k of ["extensionsUsed", "extensionsRequired"])
      if (k in c && !(Array.isArray(c[k]) && (c[k] as unknown[]).every((x) => typeof x === "string" && EXTENSION_NAME.test(x))))
        this.err(undefined, `/${k}`, `${k} must be an array of extension names (vendor_feature)`);
  }

  private rule1() {
    if (this.c.type !== "Course") this.err(1, "/type", 'type must be "Course"');
    const f = this.c.format;
    if (!(typeof f === "string" && /^\d+\.\d+$/.test(f))) this.err(1, "/format", 'format must be a string matching ^\\d+\\.\\d+$');
    else if (!f.startsWith("0.")) this.warn("spec", "/format", `format ${f} is not major 0; this validator implements 0.1`);
  }

  private rule2() {
    const c = this.c;
    if (!(typeof c.id === "string" && /^[a-z0-9-]{1,64}$/.test(c.id))) this.err(2, "/id", "id must match ^[a-z0-9-]{1,64}$");
    if (!(Number.isInteger(c.version) && (c.version as number) >= 1)) this.err(2, "/version", "version must be an integer of 1 or more");
    if (!(isNum(c.length) && c.length > 0)) this.err(2, "/length", "length must be a finite number greater than 0");
    else this.length = c.length;
  }

  private channel(rule: number, path: string, ch: unknown, n: number): boolean {
    if (!isObj(ch)) {
      this.err(rule, path, "a channel must be an object with scale and values");
      return false;
    }
    let ok = true;
    if (!(isNum(ch.scale) && ch.scale > 0)) {
      this.err(rule, `${path}/scale`, "scale must be greater than 0");
      ok = false;
    }
    if (!isIntArray(ch.values)) {
      this.err(rule, `${path}/values`, "values must be an array of integers");
      return false;
    }
    if (ch.values.length !== n) {
      this.err(rule, `${path}/values`, `expected ceil(length / step) + 1 = ${n} values, found ${ch.values.length}`);
      ok = false;
    }
    return ok;
  }

  private rule3(): boolean {
    const p = this.c.profile;
    if (!isObj(p)) return false;
    if (!(isNum(p.step) && p.step > 0 && p.step <= 50)) {
      this.err(3, "/profile/step", "profile.step must be greater than 0 and at most 50");
      return false;
    }
    const n = sampleCount(this.length, p.step);
    if (!("elevation" in p)) this.err(3, "/profile/elevation", "profile.elevation is required");
    let ok = "elevation" in p;
    for (const k of ["elevation", "grade", "heading"]) if (k in p) ok = this.channel(3, `/profile/${k}`, p[k], n) && ok;
    if ("bendRadiusLimit" in p && !(isNum(p.bendRadiusLimit) && p.bendRadiusLimit > 0))
      this.err(undefined, "/profile/bendRadiusLimit", "bendRadiusLimit must be a number of metres greater than 0");
    return ok;
  }

  private rule4(): boolean {
    const g = this.c.geometry;
    if (g === undefined) return false;
    if (!isObj(g)) {
      this.err(4, "/geometry", "geometry must be an object");
      return false;
    }
    let ok = true;
    if (g.frame !== "wgs84" && g.frame !== "local") {
      this.err(4, "/geometry/frame", 'frame must be "wgs84" or "local"');
      ok = false;
    }
    if (!(isNum(g.step) && g.step > 0)) {
      this.err(4, "/geometry/step", "geometry step must be greater than 0");
      ok = false;
    }
    if (!(isNum(g.scale) && g.scale > 0)) {
      this.err(4, "/geometry/scale", "geometry scale must be greater than 0");
      ok = false;
    }
    if (!isIntArray(g.positions)) {
      this.err(4, "/geometry/positions", "positions must be an array of integers");
      return false;
    }
    if (!ok) return false;
    const n = sampleCount(this.length, g.step as number);
    if (g.positions.length !== 2 * n) {
      this.err(4, "/geometry/positions", `expected 2 × (ceil(length / step) + 1) = ${2 * n} positions, found ${g.positions.length}`);
      return false;
    }
    if (g.frame === "wgs84") {
      if ("origin" in g) this.err(undefined, "/geometry/origin", "origin is for the local frame only");
      const s = g.scale as number;
      for (let i = 0; i < n; i++) {
        const lon = g.positions[2 * i] * s, lat = g.positions[2 * i + 1] * s;
        if (Math.abs(lon) > 180 || Math.abs(lat) > 90) {
          this.err(4, `/geometry/positions/${2 * i}`, `sample ${i} lies outside ±180 longitude or ±90 latitude (${lon}, ${lat})`);
          return false;
        }
      }
    } else if ("origin" in g) {
      const o = g.origin;
      if (!(isObj(o) && isNum(o.lon) && isNum(o.lat) && Math.abs(o.lon) <= 180 && Math.abs(o.lat) <= 90))
        this.err(undefined, "/geometry/origin", "origin must be { lon, lat } within ±180 and ±90");
    }
    return true;
  }

  private rule5() {
    const p = this.c.profile;
    const hasHeading = isObj(p) && "heading" in p;
    if (this.c.geometry === undefined && !hasHeading) this.err(5, "", "either geometry or profile.heading must be present");
    if (hasHeading && isObj(p.heading) && isNum(p.heading.scale) && isIntArray(p.heading.values)) {
      const s = p.heading.scale;
      const i = p.heading.values.findIndex((x) => !(x * s >= 0 && x * s < 360));
      if (i >= 0) this.err(5, `/profile/heading/values/${i}`, `heading ${p.heading.values[i] * s}° is outside [0, 360)`);
    }
  }

  private rule6(): Range[] {
    if (!Array.isArray(this.c.ranges)) return [];
    const ranges: Range[] = [];
    const ids = new Map<string, number>();
    const L = this.length, eps = TOLERANCE.distance;
    this.c.ranges.forEach((r, i) => {
      const p = `/ranges/${i}`;
      if (!isObj(r)) return this.err(undefined, p, "a range must be an object");
      if (typeof r.type !== "string" || r.type === "") return this.err(undefined, `${p}/type`, "type must be a non-empty string");
      if (!isNum(r.from) || !isNum(r.to)) return this.err(6, p, "from and to must be numbers");
      let ok = true;
      for (const k of ["from", "to"] as const) {
        const x = r[k] as number;
        if (x < 0 || x > L + eps) {
          this.err(6, `${p}/${k}`, `${k} = ${x} is outside [0, length = ${L}]`);
          ok = false;
        }
      }
      if (r.from > r.to && !this.closed) {
        this.err(6, p, `from ${r.from} > to ${r.to} on an open course`);
        ok = false;
      }
      if ("id" in r) {
        if (typeof r.id !== "string" || r.id === "") this.err(undefined, `${p}/id`, "id must be a non-empty string");
        else if (ids.has(r.id)) this.err(6, `${p}/id`, `range id "${r.id}" is already used by /ranges/${ids.get(r.id)}`);
        else ids.set(r.id, i);
      }
      if ("properties" in r && !isObj(r.properties)) this.err(undefined, `${p}/properties`, "properties must be an object");
      if (ok)
        ranges.push({
          index: i,
          type: r.type,
          from: r.from,
          to: r.to,
          id: typeof r.id === "string" ? r.id : undefined,
          props: isObj(r.properties) ? r.properties : {},
        });
    });
    return ranges;
  }

  /** Splits a range that runs through the start line of a loop into its two pieces. */
  private pieces(r: { from: number; to: number }): [number, number][] {
    return r.from > r.to ? [[r.from, this.length], [0, r.to]] : [[r.from, r.to]];
  }

  private rule7(ranges: Range[]) {
    const eps = TOLERANCE.distance;
    const surfaces = ranges.filter((r) => r.type === "surface");
    for (const s of surfaces) {
      const p = `/ranges/${s.index}/properties`;
      if (!(isNum(s.props.crr) && s.props.crr >= 0)) this.err(7, `${p}/crr`, "surface crr must be a number ≥ 0");
      if (!(isNum(s.props.grip) && s.props.grip > 0)) this.err(7, `${p}/grip`, "surface grip must be a number > 0");
    }
    const parts = surfaces.flatMap((s) => this.pieces(s).map(([a, b]) => ({ a, b, i: s.index }))).sort((x, y) => x.a - y.a || x.b - y.b);
    if (parts.length === 0) return this.err(7, "/ranges", "no surface ranges: they must cover [0, length]");
    let end = 0;
    let last = -1;
    for (const q of parts) {
      if (q.a > end + eps) this.err(7, `/ranges/${q.i}`, `surface gap from ${end} to ${q.a}`);
      else if (q.a < end - eps) this.err(7, `/ranges/${q.i}`, `surface overlaps /ranges/${last} from ${q.a} to ${Math.min(end, q.b)}`);
      if (q.b >= end) {
        end = q.b;
        last = q.i;
      }
    }
    if (end < this.length - eps) this.err(7, "/ranges", `surface gap from ${end} to length ${this.length}`);
  }

  /** Geometry samples as [lon, lat] or [x, y], already scaled. */
  private points(): [number, number][] {
    const g = this.c.geometry as Obj;
    const pos = g.positions as number[], s = g.scale as number;
    const out: [number, number][] = [];
    for (let i = 0; i < pos.length; i += 2) out.push([pos[i] * s, pos[i + 1] * s]);
    return out;
  }

  private dist(a: [number, number], b: [number, number]): number {
    return (this.c.geometry as Obj).frame === "wgs84" ? geodesicDistance(a[0], a[1], b[0], b[1]) : Math.hypot(b[0] - a[0], b[1] - a[1]);
  }

  private rule8() {
    const g = this.c.geometry as Obj;
    const pts = this.points();
    const step = g.step as number;
    let along = 0;
    let bad = 0, first = -1, worst = 0;
    for (let i = 1; i < pts.length; i++) {
      along += this.dist(pts[i - 1], pts[i]);
      const d = sampleD(i, step, this.length);
      const off = Math.abs(along - d);
      if (off > Math.max(1, 0.005 * d)) {
        bad++;
        if (first < 0) first = i;
        worst = Math.max(worst, off);
      }
    }
    if (bad > 0)
      this.err(8, "/geometry/positions", `geometry length disagrees with d by more than max(1 m, 0.5 %) at ${bad} sample(s), first at sample ${first} (d = ${sampleD(first, step, this.length)} m), worst by ${worst.toFixed(2)} m`);
  }

  private rule9() {
    const p = this.c.profile as Obj;
    if (!("grade" in p)) return;
    const step = p.step as number, L = this.length;
    const e = p.elevation as { scale: number; values: number[] };
    const gr = p.grade as { scale: number; values: number[] };
    const n = e.values.length;
    const d = Array.from({ length: n }, (_, i) => sampleD(i, step, L));
    const ev = e.values.map((x) => x * e.scale), gv = gr.values.map((x) => x * gr.scale);
    // Prefix integral of the linearly interpolated grade at each sample.
    const G = [0];
    for (let i = 1; i < n; i++) G.push(G[i - 1] + ((gv[i - 1] + gv[i]) / 2) * (d[i] - d[i - 1]));
    const seg = (x: number) => {
      let k = Math.min(n - 2, Math.floor(x / step));
      while (k > 0 && d[k] > x) k--;
      return k;
    };
    const at = (x: number): [number, number] => {
      if (x >= L) return [G[n - 1], ev[n - 1]];
      const k = seg(x), h = d[k + 1] - d[k], t = x - d[k];
      const slope = (gv[k + 1] - gv[k]) / h;
      return [G[k] + gv[k] * t + (slope * t * t) / 2, ev[k] + ((ev[k + 1] - ev[k]) * t) / h];
    };
    const windows: [number, number][] = L <= 1000 ? [[0, L]] : d.filter((x) => x + 1000 <= L + TOLERANCE.distance).map((x) => [x, Math.min(L, x + 1000)]);
    let worst = 0, where: [number, number] | null = null, bad = 0;
    for (const [a, b] of windows) {
      const [ga, ea] = at(a), [gb, eb] = at(b);
      const off = Math.abs(gb - ga - (eb - ea));
      if (off > 2 + 1e-9) {
        bad++;
        if (off > worst) [worst, where] = [off, [a, b]];
      }
    }
    if (where)
      this.err(9, "/profile/grade", `grade integral differs from elevation change by more than 2 m in ${bad} window(s); worst ${worst.toFixed(2)} m over [${where[0]}, ${where[1]}]`);
  }

  private rule10(ranges: Range[], geometryOk: boolean) {
    const bends = ranges.filter((r) => r.type === "bend");
    const eps = TOLERANCE.distance;
    for (const b of bends) {
      const p = `/ranges/${b.index}/properties`;
      if (!(isNum(b.props.radius) && b.props.radius > 0)) this.err(10, `${p}/radius`, "bend radius must be a number > 0");
      if (b.props.direction !== "left" && b.props.direction !== "right") this.err(10, `${p}/direction`, 'bend direction must be "left" or "right"');
      const a = b.props.apex;
      if (!isNum(a) || !this.pieces(b).some(([x, y]) => a >= x - eps && a <= y + eps))
        this.err(10, `${p}/apex`, `bend apex ${String(a)} is not inside the range [${b.from}, ${b.to}]`);
    }
    const parts = bends.flatMap((b) => this.pieces(b).map(([x, y]) => ({ x, y, i: b.index }))).sort((u, w) => u.x - w.x);
    for (let k = 1; k < parts.length; k++)
      if (parts[k].x < parts[k - 1].y - eps) this.err(10, `/ranges/${parts[k].i}`, `bend overlaps /ranges/${parts[k - 1].i}`);

    const p = this.c.profile;
    const limit = isObj(p) ? p.bendRadiusLimit : undefined;
    if (!isNum(limit) || limit <= 0) return;
    if (!geometryOk) {
      if (this.c.geometry === undefined) this.warn("R10", "/profile/bendRadiusLimit", "bend completeness not checked: the file has no geometry");
      return;
    }
    if (this.length > TOLERANCE.maxResample) {
      this.warn("R10", "/length", `bend completeness not checked: length over ${TOLERANCE.maxResample} m`);
      return;
    }
    for (const m of measureBends(this.points(), (this.c.geometry as Obj).frame as string, (this.c.geometry as Obj).step as number, this.length, this.closed, limit)) {
      const found = bends.some((b) => b.props.direction === m.direction && isNum(b.props.apex) && this.inStretch(b.props.apex, m));
      if (!found) this.err(10, "/ranges", `missing ${m.direction} bend from ${m.from} to ${m.to} m (radius ${m.radius.toFixed(1)} m at ${m.apex} m)`);
    }
  }

  /** Whether d lies inside a measured stretch, widened by TOLERANCE.apex at each end. */
  private inStretch(d: number, m: MeasuredBend): boolean {
    const t = TOLERANCE.apex, L = this.length;
    if (m.from <= m.to) {
      if (d >= m.from - t && d <= m.to + t) return true;
      return this.closed && (d - L >= m.from - t || d + L <= m.to + t);
    }
    return d >= m.from - t || d <= m.to + t;
  }

  private rule11(ranges: Range[]) {
    for (const r of ranges) if (r.type === "segment" && r.id === undefined) this.err(11, `/ranges/${r.index}`, "segment has no id");
  }

  private rule12(profileOk: boolean, geometryOk: boolean) {
    if (!this.closed) return;
    const p = this.c.profile as Obj;
    if (profileOk && isObj(p.elevation)) {
      const v = (p.elevation as { values: number[] }).values;
      if (v[0] !== v[v.length - 1]) this.err(12, "/profile/elevation/values", `closed course: first and last elevation samples differ (${v[0]} and ${v[v.length - 1]})`);
    }
    if (geometryOk) {
      const pts = this.points();
      const gap = this.dist(pts[0], pts[pts.length - 1]);
      if (gap > 1) this.err(12, "/geometry/positions", `closed course: first and last positions are ${gap.toFixed(2)} m apart`);
    }
  }

  private rule13() {
    const used = Array.isArray(this.c.extensionsUsed) ? this.c.extensionsUsed : [];
    const req = Array.isArray(this.c.extensionsRequired) ? this.c.extensionsRequired : [];
    req.forEach((n, i) => {
      if (!used.includes(n)) this.err(13, `/extensionsRequired/${i}`, `required extension "${String(n)}" is not in extensionsUsed`);
    });
  }

  private rule14() {
    if (!Array.isArray(this.c.sources)) return;
    const hasAttribution = Array.isArray(this.c.attribution) && this.c.attribution.length > 0;
    this.c.sources.forEach((s, i) => {
      if (!isObj(s) || typeof s.licence !== "string") return;
      const id = s.licence;
      if (attributionLicences.requireAttribution.includes(id)) {
        if (!hasAttribution) this.err(14, `/sources/${i}/licence`, `source licence ${id} requires attribution, but the course has none`);
      } else if (!attributionLicences.noAttribution.includes(id)) {
        this.warn("R14", `/sources/${i}/licence`, `licence "${id}" is not on the registry's attribution list; check whether it requires attribution`);
      }
    });
  }

  /** Rule 15, then MUST and SHOULD text outside section 8, reported as warnings. */
  private otherSpecText(ranges: Range[], profileOk: boolean) {
    for (const r of ranges) {
      const p = `/ranges/${r.index}`;
      if (!CORE_TYPES.has(r.type) && !VENDOR_VALUE.test(r.type)) this.warn("spec", `${p}/type`, `unknown range type "${r.type}" (not core, not vendor:name)`);
      const kinds = KINDS[r.type];
      if (kinds) {
        const k = r.props.kind;
        if (typeof k !== "string") this.err(undefined, `${p}/properties/kind`, `${r.type} needs a kind`);
        else if (!kinds.includes(k) && !VENDOR_VALUE.test(k)) this.err(undefined, `${p}/properties/kind`, `"${k}" is not a ${r.type} kind (${kinds.join(", ")}) or a vendor:name value`);
      }
    }
    const used = new Set(Array.isArray(this.c.extensionsUsed) ? this.c.extensionsUsed : []);
    for (const name of extensionNames(this.c)) {
      if (!EXTENSION_NAME.test(name)) this.err(undefined, "", `extension name "${name}" is not lowercase vendor_feature`);
      else if (!used.has(name)) this.warn("spec", "/extensionsUsed", `extension "${name}" is used but not listed in extensionsUsed (spec 7)`);
    }
    const s = this.c.summary;
    if (profileOk && isObj(s) && isNum(s.elevationGain)) {
      const e = (this.c.profile as Obj).elevation as { scale: number; values: number[] };
      let gain = 0;
      for (let i = 1; i < e.values.length; i++) gain += Math.max(0, e.values[i] - e.values[i - 1]);
      gain *= e.scale;
      if (Math.abs(gain - s.elevationGain) > 1e-6 * Math.max(1, gain))
        this.warn("spec", "/summary/elevationGain", `summary.elevationGain is ${s.elevationGain}, the samples give ${+gain.toFixed(6)} (spec 3 says MUST equal)`);
    }
    if (this.closed) {
      for (const r of ranges)
        if (r.type === "marker" && r.props.kind === "finish") this.err(15, `/ranges/${r.index}`, "a closed course must not have a finish marker");
    } else {
      const at = (kind: string, d: number) => ranges.some((r) => r.type === "marker" && r.props.kind === kind && Math.abs(r.from - d) <= TOLERANCE.distance);
      if (!at("start", 0)) this.warn("spec", "/ranges", "open course has no start marker at 0 (spec 5.9 SHOULD)");
      if (!at("finish", this.length)) this.warn("spec", "/ranges", "open course has no finish marker at length (spec 5.9 SHOULD)");
    }
  }
}

function extensionNames(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => extensionNames(x, out));
  else if (isObj(v)) {
    for (const [k, x] of Object.entries(v)) {
      if (k === "extensions" && isObj(x)) Object.keys(x).forEach((n) => out.add(n));
      else extensionNames(x, out);
    }
  }
  return out;
}

export interface MeasuredBend {
  direction: "left" | "right";
  from: number;
  to: number;
  /** Smallest measured radius, and the apex as spec 5.4 defines it: the middle of the run within 1 % of that radius. */
  radius: number;
  apex: number;
}

/**
 * Measures bends as spec 5.4 defines them: geometry resampled at 1 m, radius
 * r = window ÷ |Δψ| with Δψ the unwrapped heading change over d ± 10 m. Where
 * the spec is silent this follows the reference writer: the window is clamped
 * at the ends of an open course and divided by the shorter span, a stretch is
 * split where the turn changes sign, and same-direction stretches less than
 * 10 m apart are joined.
 */
export function measureBends(
  samples: [number, number][],
  frame: string,
  step: number,
  length: number,
  closed: boolean,
  limit: number,
): MeasuredBend[] {
  // Resample at whole metres by d (positions are linear between samples).
  const ds: number[] = [];
  for (let x = 0; x < length - 1e-9; x++) ds.push(x);
  if (!closed) ds.push(length);
  const pts = ds.map((x) => {
    const i = Math.min(samples.length - 2, Math.floor(x / step));
    const d0 = i * step, d1 = Math.min((i + 1) * step, length);
    const t = d1 > d0 ? Math.min(1, (x - d0) / (d1 - d0)) : 0;
    const [a, b] = [samples[i], samples[i + 1]];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as [number, number];
  });
  const m = pts.length;
  const nSeg = closed ? m : m - 1;
  // Compass heading of each 1 m segment.
  const psi: number[] = [];
  for (let k = 0; k < nSeg; k++) {
    const a = pts[k], b = pts[(k + 1) % m];
    const [dx, dy] = frame === "wgs84" ? localOffset(a[0], a[1], b[0], b[1]) : [b[0] - a[0], b[1] - a[1]];
    psi.push(dx === 0 && dy === 0 ? (k > 0 ? psi[k - 1] : 0) : Math.atan2(dx, dy));
  }
  const wrap = (x: number) => x - 2 * Math.PI * Math.round(x / (2 * Math.PI));
  // Turn at each vertex, positive clockwise (a right turn).
  const delta = new Array<number>(m).fill(0);
  for (let k = 0; k < m; k++) {
    if (!closed && (k === 0 || k === m - 1)) continue;
    delta[k] = wrap(psi[k % nSeg] - psi[(k - 1 + nSeg) % nSeg]);
  }
  // Heading change between the tangents at vertices a and b (half turns at the ends).
  const prefix = [0];
  for (let k = 0; k < m; k++) prefix.push(prefix[k] + delta[k]);
  const turn = (a: number, b: number) => {
    let s: number;
    if (a <= b) s = prefix[b + 1] - prefix[a];
    else s = prefix[m] - prefix[a] + prefix[b + 1];
    return s - delta[a] / 2 - delta[b] / 2;
  };
  const r = new Array<number>(m), sign = new Array<number>(m);
  for (let k = 0; k < m; k++) {
    let a: number, b: number, span: number;
    if (closed) {
      a = (k - 10 + m) % m;
      b = (k + 10) % m;
      span = Math.min(20, length);
    } else {
      a = Math.max(0, k - 10);
      b = Math.min(m - 1, k + 10);
      span = ds[b] - ds[a];
    }
    const t = turn(a, b);
    r[k] = t === 0 ? Infinity : span / Math.abs(t);
    sign[k] = Math.sign(t);
  }
  // Stretches below the limit, split where the sign changes.
  const inBend = (k: number) => r[k] < limit;
  let start = 0;
  if (closed) {
    const free = r.findIndex((_, k) => !inBend(k));
    if (free < 0) {
      const kmin = r.reduce((a, x, k) => (x < r[a] ? k : a), 0);
      return [{ direction: sign[0] > 0 ? "right" : "left", from: 0, to: length, radius: r[kmin], apex: ds[kmin] }];
    }
    start = free;
  }
  const runs: { dir: number; ks: number[] }[] = [];
  for (let j = 0; j < m; j++) {
    const k = (start + j) % m;
    if (!inBend(k)) continue;
    const prev = runs[runs.length - 1];
    const prevK = prev ? prev.ks[prev.ks.length - 1] : -2;
    if (prev && prev.dir === sign[k] && (prevK + 1) % m === k) prev.ks.push(k);
    else runs.push({ dir: sign[k], ks: [k] });
  }
  // Join same-direction stretches less than 10 m apart.
  const gap = (a: number, b: number) => (closed ? (ds[b] - ds[a] + length) % length : ds[b] - ds[a]);
  const joined: typeof runs = [];
  for (const run of runs) {
    const prev = joined[joined.length - 1];
    if (prev && prev.dir === run.dir && gap(prev.ks[prev.ks.length - 1], run.ks[0]) < 10) prev.ks.push(...run.ks);
    else joined.push({ dir: run.dir, ks: [...run.ks] });
  }
  if (closed && joined.length > 1) {
    const first = joined[0], last = joined[joined.length - 1];
    if (first.dir === last.dir && gap(last.ks[last.ks.length - 1], first.ks[0]) < 10) {
      last.ks.push(...first.ks);
      joined.shift();
    }
  }
  return joined.map(({ dir, ks }) => {
    const kmin = ks.reduce((a, k) => (r[k] < r[a] ? k : a), ks[0]);
    // The run around the minimum where r stays within 1 %, and its middle.
    const at = ks.indexOf(kmin);
    let lo = at, hi = at;
    while (lo > 0 && r[ks[lo - 1]] <= r[kmin] * 1.01) lo--;
    while (hi < ks.length - 1 && r[ks[hi + 1]] <= r[kmin] * 1.01) hi++;
    const span = (ds[ks[hi]] - ds[ks[lo]] + (closed ? length : 0)) % (closed ? length : Infinity);
    const mid = (ds[ks[lo]] + span / 2) % length;
    return { direction: dir > 0 ? "right" : "left", from: ds[ks[0]], to: ds[ks[ks.length - 1]], radius: r[kmin], apex: Math.round(mid * 100) / 100 };
  });
}
