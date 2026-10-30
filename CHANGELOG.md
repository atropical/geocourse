# Changelog

Spec, schema and validator versions. Dates are UTC.

## Unreleased

- Pending: Frost Gate Traverse added to `tests/0.1/valid/`.
- Spec 0.1 re-converted from doc rev 58: bend window clamped at the ends of an open course and wrapping on a loop, S-bends split where the direction changes, rule 9 windows defined, headings that round to 360° stored as 0, no finish marker on a closed course (rule 15, rev 59), `widthSource` `"design"`, drafts may change until released.
- Schema 0.1: `widthSource` accepts `"design"`.
- Validator: rule 15, a finish marker on a closed course; measured apex as 5.4 defines it; bend completeness skipped above 10 000 km.
- Tests: valid S-bend and bend-at-start courses; invalid heading of 3600 (rule 5) and finish on a loop.

## Draft 0.1 — 2026-10-30

- Spec draft 0.1 published at `spec/0.1/`.
- JSON Schema 0.1 at `https://geocourse.org/schema/0.1/geocourse.schema.json`.
- Reference validator and `geocourse-validate` CLI covering rules 1 to 14 of section 8.
- Test files for 0.1: two valid courses and one invalid file per rule.
- Registry: range types, `kind` values, extension names, attribution licences.
