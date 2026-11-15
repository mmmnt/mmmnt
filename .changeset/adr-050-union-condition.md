---
'@mmmnt/cli': minor
---

A policy condition reads the variant of a tagged union field (ADR-050).

- core: a policy's `when` field may be the path `<field>.kind` on a field of its trigger typed by a tagged union (ADR-049): `trigger DecisionRecorded when decision.kind = Admitted`. The IR's `condition.field` is the path as written (`"decision.kind"`) and `condition.equals` the variant; no IR key is added, and a condition without a dot is unchanged. No new keyword or token (`.` already was one). New rules, with V49's severity (a warning per file, an error over a merged project): V56 (a path on a field that is not a single union, a segment other than `kind`, or a union field guarded without `.kind`) and V57 (a variant the union does not declare). V49 checks a path's first segment.
- derive: the trigger occurrence a declared reaction names carries `<field>: { kind: <Variant> }`; the trigger's other occurrences carry the union's first variant that no guard on the field declares, so they decidably do not meet it. `policy-definitions.json` carries the path as written.
- board: the policy text and the manifest write the guard as written, `decision.kind = Admitted`.

Not breaking: every model that parsed under 0.12.0 has the same IR, and `parse`, `test`, `derive`, `viz`, `cucumber-json`, `simulate --all`, `generate`, `emit-ts`, `board` and `schema emit` write the same files for TicketWave, every valid fixture and the Sift model copy. A Facet that does not read dotted paths treats the guard as undecidable, so it holds the reaction at every occurrence, as for a policy with no condition.
