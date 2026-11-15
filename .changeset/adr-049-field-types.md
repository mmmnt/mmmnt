---
'@mmmnt/cli': minor
---

Fields declare optionality, code sets, unions, maps and patterns, and `moment schema emit` writes one closed JSON Schema per event payload (ADR-049).

- core: `name?: T` is optional; `"a" | "b"` is a code set; `value-object Name: T` is a scalar value object (a code set when `T` is one) and a value object with `| Variant` lines is a tagged union discriminated by `kind`; `a: T | b: U` on one field line is an exclusive group (exactly one present); `T{}` and `T{key}` are maps keyed by string; `[pattern "<regex>"]` and `[encrypted]` are field attributes beside `[deprecated …]`. The IR gains optional keys only: `FieldDefinition.enum`, `map`, `pattern`, `encrypted`, `exclusive` and `ValueObjectDefinition.scalar`, `variants`; `required` is `false` for an optional field and for every member of an exclusive group. `pattern` is a new keyword, escaped in field, input and lane names; `?`, `{` and `}` are new tokens. New rules, errors in a single file: V52 (a union field named `kind`), V53 (a variant or a code twice), V54 (an optional member of an exclusive group), V55 (an invalid pattern, or a pattern on a type that is not string-valued).
- schema: `emitPayloadSchemas(ir)` returns one JSON Schema (draft 2020-12) per event, closed at every level, with value objects in `$defs`: an optional field is not in `required`, a code set is `enum`, a union is `oneOf` with one closed branch per variant, an exclusive group is `oneOf` of `required`, a map types `additionalProperties`, a pattern is `pattern`, and `[encrypted]` is `x-encrypted: true` with the `{dataKeyId, ciphertext}` envelope. An undeclared type is a diagnostic.
- cli: `moment schema emit <file|dir> [--out-dir <dir>]`.
- emit-ts: a code set is a union of string literals, a map `Readonly<Record<string, T>>`, a scalar value object a type alias and a union a discriminated union on `kind`.
- derive: a sample payload takes a code set's first value, `{}` for a map, and only the first member of an exclusive group.

Not breaking: every model that parsed under 0.11.0 has the same IR, and `parse`, `test`, `simulate --all`, `derive`, `generate` and `emit-ts` write the same files for TicketWave, every valid fixture and the Sift model copy.
