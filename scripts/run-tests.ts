// SPDX-License-Identifier: Apache-2.0

// Runs the reference validator and the JSON Schema against every file in
// tests/0.1/manifest.json. A valid file must pass both with no errors. An
// invalid file must fail the validator with errors for its rule and no other.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { validateText } from "../src/validate.js";

const root = process.cwd();
const dir = join(root, "tests", "0.1");
const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
const schema = JSON.parse(readFileSync(join(root, "schema", "0.1", "geocourse.schema.json"), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, strictRequired: false, allowUnionTypes: true });
(addFormats as unknown as (a: Ajv2020) => void)(ajv);
const schemaCheck = ajv.compile(schema);

let failures = 0;
const fail = (file: string, why: string) => {
  failures++;
  console.log(`FAIL ${file}: ${why}`);
};

for (const t of manifest.tests) {
  const text = readFileSync(join(dir, t.file), "utf8");
  const result = validateText(text);
  const errors = result.issues.filter((i) => i.severity === "error");
  const schemaOk = schemaCheck(JSON.parse(text));
  if (t.valid) {
    if (!result.valid) fail(t.file, `validator rejected a valid file:\n${errors.map((e) => `  ${e.code} ${e.path}: ${e.message}`).join("\n")}`);
    else if (!schemaOk) fail(t.file, `schema rejected a valid file: ${ajv.errorsText(schemaCheck.errors)}`);
    else console.log(`ok   ${t.file} (valid${result.issues.length ? `, ${result.issues.length} warning(s)` : ""})`);
    continue;
  }
  const other = errors.filter((e) => e.code !== t.code);
  const hit = errors.find((e) => e.code === t.code && e.message.includes(t.message));
  if (!hit) fail(t.file, `expected ${t.code} "${t.message}", got:\n${errors.map((e) => `  ${e.code}: ${e.message}`).join("\n") || "  no errors"}`);
  else if (other.length) fail(t.file, `errors beyond ${t.code}:\n${other.map((e) => `  ${e.code}: ${e.message}`).join("\n")}`);
  else console.log(`ok   ${t.file} (${t.code}${schemaOk ? "" : ", schema also rejects"})`);
}

console.log(failures ? `\n${failures} failure(s)` : `\nall ${manifest.tests.length} test files pass`);
process.exit(failures ? 1 : 0);
