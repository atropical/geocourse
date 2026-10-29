#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { validateText, type Issue } from "./validate.js";

const USAGE = `Usage: geocourse-validate [--json] [--quiet] file.geocourse.json [more files]

Checks GeoCourse 0.1 files against every rule in section 8 of the spec.
Files ending in .gz are decompressed first.
Exit status: 0 all valid, 1 at least one invalid, 2 usage or read error.`;

const args = process.argv.slice(2);
const json = args.includes("--json");
const quiet = args.includes("--quiet");
const files = args.filter((a) => !a.startsWith("--"));
if (files.length === 0 || args.includes("--help") || args.includes("-h")) {
  console.log(USAGE);
  process.exit(files.length === 0 && !args.includes("--help") && !args.includes("-h") ? 2 : 0);
}

const line = (i: Issue) => `  ${i.severity === "error" ? "error" : "warning"} ${i.code}${i.path ? ` at ${i.path}` : ""}: ${i.message}`;

let status = 0;
const report: { file: string; valid: boolean; issues: Issue[] }[] = [];
for (const file of files) {
  let text: string;
  try {
    const bytes = readFileSync(file);
    text = (file.endsWith(".gz") ? gunzipSync(bytes) : bytes).toString("utf8");
  } catch (e) {
    console.error(`${file}: ${(e as Error).message}`);
    status = 2;
    continue;
  }
  const result = validateText(text);
  report.push({ file, ...result });
  if (!result.valid && status === 0) status = 1;
  if (!json) {
    console.log(`${file}: ${result.valid ? "valid" : "invalid"}`);
    for (const i of result.issues) if (!quiet || i.severity === "error") console.log(line(i));
  }
}
if (json) console.log(JSON.stringify(report, null, 2));
process.exit(status);
