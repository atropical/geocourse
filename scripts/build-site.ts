// SPDX-License-Identifier: Apache-2.0

// Builds the static site for geocourse.org into _site/. Run with
// `npm run site`. Pages are rendered from the Markdown and JSON in the repo;
// the source repository address appears only in the /source/ and /request/
// redirects, so the site never depends on where the source is hosted.

import { copyFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { Marked } from "marked";

/** The only place the source host is named. Change it here if the repository moves. */
const SOURCE = "https://github.com/atropical/geocourse";
const REQUEST = `${SOURCE}/issues/new?template=registry-name.yml`;

const root = process.cwd();
const out = join(root, "_site");
const read = (p: string) => readFileSync(join(root, p), "utf8");

/** Repo files with a page or copy on the site, and where. */
const SITE_PATH: Record<string, string> = {
  "README.md": "/",
  "spec/0.1/geocourse-0.1.md": "/spec/0.1/",
  "registry/README.md": "/registry/",
  "tests/0.1/README.md": "/tests/0.1/",
  "src/README.md": "/validator/",
  "CONTRIBUTING.md": "/contributing/",
  "CHANGELOG.md": "/changelog/",
  "LICENSE": "/LICENSE.txt",
  "spec/LICENSE": "/spec/LICENSE.txt",
  "tests/LICENSE": "/tests/LICENSE.txt",
  "registry/LICENSE": "/registry/LICENSE.txt",
};

const slug = (s: string) => s.toLowerCase().replace(/<[^>]+>/g, "").replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s+/g, "-");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Renders Markdown from a repo file, mapping relative links to their site paths. */
function render(md: string, from: string): string {
  const marked = new Marked({
    renderer: {
      heading({ tokens, depth }) {
        const html = this.parser.parseInline(tokens);
        return `<h${depth} id="${slug(html)}">${html}</h${depth}>\n`;
      },
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        return `<a href="${esc(siteHref(href, from))}"${title ? ` title="${esc(title)}"` : ""}>${text}</a>`;
      },
    },
  });
  return marked.parse(md, { async: false });
}

function siteHref(href: string, from: string): string {
  if (/^[a-z]+:|^#|^\//i.test(href)) return href;
  const [path, hash] = href.split("#");
  const repoPath = posix.normalize(posix.join(posix.dirname(from), path)).replace(/\/$/, "");
  const mapped = SITE_PATH[repoPath];
  const target = mapped ?? `/${repoPath}${path.endsWith("/") ? "/" : ""}`;
  return hash ? `${target}#${hash}` : target;
}

const NAV: [string, string][] = [
  ["/", "Home"],
  ["/spec/0.1/", "Spec"],
  ["/schema/", "Schema"],
  ["/registry/", "Registry"],
  ["/tests/0.1/", "Tests"],
];

function page(path: string, title: string, body: string) {
  const nav = NAV.map(([href, label]) => `<a href="${href}"${(href === "/" ? path === "/" : path.startsWith(href.replace(/0\.1\/$/, ""))) ? ' aria-current="page"' : ""}>${label}</a>`).join("");
  const html = `<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="/style.css">
</head>
<body>
<header><a class="brand" href="/">GeoCourse</a><nav>${nav}</nav></header>
<main>
${body}
</main>
<footer>GeoCourse draft 0.1 · <a href="/source/">Source</a> · <a href="/contributing/">Contributing</a> · <a href="/changelog/">Changelog</a> · Spec <a href="/spec/LICENSE.txt">CC BY 4.0</a>, schema and tools <a href="/LICENSE.txt">Apache-2.0</a>, test files and registry <a href="/tests/LICENSE.txt">CC0</a></footer>
</body>
</html>
`;
  const file = join(out, path.endsWith("/") ? `${path}index.html` : path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

function redirect(path: string, to: string) {
  const file = join(out, path, "index.html");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `<!DOCTYPE html><html lang="en-GB"><head><meta charset="utf-8"><title>Redirecting</title><meta http-equiv="refresh" content="0; url=${esc(to)}"><link rel="canonical" href="${esc(to)}"></head><body><a href="${esc(to)}">${esc(to)}</a></body></html>\n`);
}

const table = (head: string[], rows: string[][]) =>
  `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const code = (s: string) => `<code>${esc(s)}</code>`;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// Home.
page("/", "GeoCourse: an open format for rideable cycling courses", render(read("README.md"), "README.md"));

// Spec.
page("/spec/0.1/", "GeoCourse specification, draft 0.1", render(read("spec/0.1/geocourse-0.1.md"), "spec/0.1/geocourse-0.1.md"));
copyFileSync(join(root, "spec/0.1/geocourse-0.1.md"), join(out, "spec/0.1/geocourse-0.1.md"));
redirect("/spec/", "/spec/0.1/");

// Schema.
const schemaText = read("schema/0.1/geocourse.schema.json");
const schemaId = JSON.parse(schemaText).$id as string;
mkdirSync(join(out, "schema/0.1"), { recursive: true });
copyFileSync(join(root, "schema/0.1/geocourse.schema.json"), join(out, "schema/0.1/geocourse.schema.json"));
page("/schema/", "GeoCourse schema", `<h1 id="schema">Schema</h1>
<p>JSON Schema 2020-12 for GeoCourse 0.1. It checks structure, types, patterns and value ranges. Sample counts, coverage and other cross-references need the <a href="/validator/">reference validator</a>, which checks every rule of section 8.</p>
${table(["Version", "$id", "Spec"], [["0.1", `<a href="${esc(schemaId)}">${esc(schemaId)}</a>`, `<a href="/spec/0.1/#8-validation-rules">Draft 0.1, section 8</a>`]])}
<p>A file may name the schema in <code>$schema</code> so editors find it. Readers must not depend on it or fetch it to read a file (spec 3). A draft such as 0.1 may change until it is declared released; after that it is frozen and fixes go into a new version.</p>
<h2 id="schema-0-1">0.1</h2>
<pre><code>${esc(schemaText)}</code></pre>`);

// Registry.
const reg = (f: string) => JSON.parse(read(`registry/${f}`));
const types = reg("range-types.json"), kinds = reg("kinds.json"), exts = reg("extensions.json"), lic = reg("attribution-licences.json");
cpSync(join(root, "registry"), join(out, "registry"), { recursive: true, filter: (p) => !p.endsWith(".md") && !p.endsWith("LICENSE") });
copyFileSync(join(root, "registry/LICENSE"), join(out, "registry/LICENSE.txt"));
page("/registry/", "GeoCourse registry", `${render(read("registry/README.md"), "registry/README.md")}
<h2 id="range-types">Range types</h2>
${table(["Type", "Spec", "Since"], types.entries.map((e: { name: string; spec: string; since: string }) => [code(e.name), `<a href="/spec/0.1/">${e.spec}</a>`, e.since]))}
<h2 id="kind-values">Kind values</h2>
${table(["Range type", "kind", "OSM tags", "Since"], kinds.entries.map((e: { type: string; kind: string; osm?: string; since: string }) => [code(e.type), code(e.kind), e.osm ? code(e.osm) : "", e.since]))}
<h2 id="extensions">Extensions</h2>
${exts.entries.length ? table(["Name", "Vendor", "Description"], exts.entries.map((e: { name: string; vendor: string; description: string }) => [code(e.name), esc(e.vendor), esc(e.description)])) : "<p>None registered yet.</p>"}
<p>Reserved vendor prefixes: ${exts.reserved.map(code).join(", ")}.</p>
<h2 id="attribution-licences">Attribution licences</h2>
<p>A source under one of these licences makes <code>attribution</code> required (rule 14): ${lic.requireAttribution.map(code).join(", ")}.</p>
<p>No attribution needed: ${lic.noAttribution.map(code).join(", ")}. Any other licence id is reported as a warning.</p>`);
redirect("/request/", REQUEST);

// Tests.
const manifest = JSON.parse(read("tests/0.1/manifest.json"));
cpSync(join(root, "tests/0.1"), join(out, "tests/0.1"), { recursive: true, filter: (p) => !p.endsWith(".md") });
copyFileSync(join(root, "tests/LICENSE"), join(out, "tests/LICENSE.txt"));
type T = { file: string; valid: boolean; rule?: number; code?: string; message?: string; description: string };
const link = (f: string) => `<a href="/tests/0.1/${f}">${esc(f.split("/")[1])}</a>`;
page("/tests/0.1/", "GeoCourse 0.1 test files", `${render(read("tests/0.1/README.md"), "tests/0.1/README.md")}
<h2 id="valid-files">Valid files</h2>
${table(["File", "Description"], manifest.tests.filter((t: T) => t.valid).map((t: T) => [link(t.file), esc(t.description)]))}
<h2 id="invalid-files">Invalid files</h2>
${table(["Rule", "File", "Description", "Expected error contains"], manifest.tests.filter((t: T) => !t.valid).map((t: T) => [t.rule ? String(t.rule) : esc(t.code ?? ""), link(t.file), esc(t.description), code(t.message ?? "")]))}`);

// Other pages, licences and redirects.
page("/validator/", "GeoCourse reference validator", render(read("src/README.md"), "src/README.md"));
page("/contributing/", "Contributing to GeoCourse", render(read("CONTRIBUTING.md"), "CONTRIBUTING.md"));
page("/changelog/", "GeoCourse changelog", render(read("CHANGELOG.md"), "CHANGELOG.md"));
copyFileSync(join(root, "LICENSE"), join(out, "LICENSE.txt"));
copyFileSync(join(root, "spec/LICENSE"), join(out, "spec/LICENSE.txt"));
redirect("/source/", SOURCE);
page("/404.html", "Not found", `<h1 id="not-found">Not found</h1><p>Try the <a href="/">home page</a> or the <a href="/spec/0.1/">spec</a>.</p>`);
copyFileSync(join(root, "site/style.css"), join(out, "style.css"));
copyFileSync(join(root, "CNAME"), join(out, "CNAME"));
writeFileSync(join(out, ".nojekyll"), "");
console.log(`site built in ${out}`);
