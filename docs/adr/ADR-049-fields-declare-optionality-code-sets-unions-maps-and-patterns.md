# ADR-049: Fields declare optionality, code sets, unions, maps and patterns

- **Status:** Proposed (2026-11-14). Built on branch `feat/field-types` for review; the syntax below is put to the founder before it is accepted and released.
- **Date:** 2026-11-14
- **Supersedes:** nothing. Extends the field rule of the grammar (`FieldDeclaration`, `InputField`, `TypeReference`, `ValueObjectDeclaration`) additively.
- **Founder ruling (Sift workspace 729c1a1d, flmnt decision f93ebffc, 2026-11-14, verbatim label):** "Extend Moment grammar": "Moment's grammar gains syntax for optional fields, enums (code sets) and unions/oneOf (and patterns/formats as needed), released on the founder's go; then model/ is edited to state them, so model/ alone stays the spec of record and the D6 generator reads it with no overlay." Same decision, label "x-encrypted + envelope (Recommended)": an encrypted free-text field carries the schema marker `x-encrypted: true` and the value `{dataKeyId, ciphertext}`.
- **Release:** proposed 0.12.0 (minor), on the founder's go. Nothing is published by this branch.
- **Numbering:** next free after ADR-048.
- **Source read:** Moment 0.11.0 (`packages/core/src/grammar/moment.langium`, `parser/ast-to-ir.ts`, `ir/context-definition.ts`, `emit-ts`, `derive/engine/simulation-scenario-generator.ts`); Sift's `model/` (read only) and its hand-written payload schemas `contracts/{enablement,intake}/events/*.schema.json` and `contracts/adrs/event-envelope.schema.json`; Sift's convergence gate `tools/verify/converged.sh`.

## Context

A Moment field is `name: Type` with `Type` one of `string`, `number`, `boolean`, `UUID`, `DateTime`, `Date`, `Money` or a value object, optionally `[]`. Every field is required: `ast-to-ir` writes `required: true` on every `FieldDefinition`, although the IR has carried the flag since 0.1 and `emit-ts` already prints `?` for a field that is not required.

Sift must generate a closed JSON Schema for each of its 63 event payloads from `model/` alone. Its model states payload shapes that the grammar cannot, so it writes them in trailing comments:

- **optional fields:** `SiftEnabled {origin, personallyEnabled, billingEventId?}` (S:210), `Actor {sub, clientId?, roles?, kind}` (S:102), `Arrival`'s location and content hash, `ConstructSuperseded {cause, Pointer?, pass?}`;
- **code sets:** `origin: Person | Reactivation | Reconciliation`, `Actor.kind: user | api | system`, `PassCompleted.verdict`, `SetupCompleted.kind: Bootstrap | Resume`;
- **tagged unions:** `Arrival = Live | Replay(Bootstrap | Resume) | Document(documentVersion)`, `ReceiptProcessed.effect = Applied | None(reason)`, `PlacementOutcome = New | SameAs {target, addition?} | …`, `CycleTrigger` with seven alternatives;
- **mutually exclusive fields:** `AnswerApplied {outcome, question | computedBy}`, `PlacementMarkedStale {proposal | gap, cause, n}`;
- **maps:** `ReplayCompleted`'s replay point and end point "per stream";
- **patterns:** a content hash is `^[0-9a-f]{64}$`;
- **one-field value objects** (`CorpusVersion {value}`, `ConstructId {value}`) that the spec means as scalars;
- **encrypted free text** (the ruling above).

The hand-written Sift schemas show the target: `"enum": ["Person", "Reactivation", "Reconciliation"]`, an optional `billingEventId` left out of `required`, `"additionalProperties": false`, `"pattern": "^[0-9a-f]{64}$"`.

No Moment package emits a JSON Schema for an event payload today; AsyncAPI carries payload properties for crossings only.

## Decision

Every construct below is opt-in. A model that uses none of them parses to the same IR, byte for byte, and every artifact is unchanged (D9).

### D1. Optional field: `name?: Type`

```
event SiftEnabled
  origin: "Person" | "Reactivation" | "Reconciliation"
  personallyEnabled: boolean
  billingEventId?: string
  actor: Actor
```

`?` after the name, as the spec writes it (`billingEventId?`) and as TypeScript does. The IR's existing `required` becomes `false`. Allowed on event, value-object, projection (`field x?: T`) and command or query input fields (`input a: string, b?: number`). A field without `?` stays required, so every existing model means what it meant.

### D2. Code set: string literals joined by `|`

```
kind: "user" | "api" | "system"
value-object ActorKind: "user" | "api" | "system"
```

A type may be one or more double-quoted literals joined by `|`. The values are the strings as written, so a code that is not an identifier (`"no candidate"`) or that is a Moment keyword (`"none"`) needs no escaping. Literals rather than bare names because a bare name is already a type reference (`Pointer | RecordRef` would be ambiguous between a code set and a union of value objects). A named code set is a scalar value object (D4) whose type is a literal set, used like any value object (`kind: ActorKind`). IR: `type: "string"`, `enum: [...]`, so every consumer that ignores `enum` still reads a string.

### D3. Tagged union: a value object with `| Variant` lines

```
value-object Arrival
  actor: Actor
  | Live
  | Replay
      replay: "Bootstrap" | "Resume"
  | Document
      documentVersion: DocumentVersion
      location: string
      contentHash?: ContentHash

value-object ReceiptEffect
  | Applied
  | None
      reason: "no candidate" | "boundary" | "Unauthorised" | "Closed" | "Stale" | "Invalid" | "Undecided"
```

A value object's fields are followed by zero or more variants. A variant is `| <Name>` and the fields it adds. Fields before the first `|` are common to every variant; fields after a variant belong to that variant (so common fields are written first). A value object with variants is a tagged union: a value is one variant, its discriminator is the property `kind` holding the variant's name, then the common fields, then the variant's fields. `kind` is fixed because it is the name Sift's model already gives the discriminator of every union it has (`Arrival.kind`, `CycleTrigger.kind`, `GapHandling.kind`, `PlacementOutcome.kind`, `SupersedeCause.kind`). No new keyword: a union is a kind of value object, as the palette has it.

IR: `ValueObjectDefinition.variants?: { name; fields }[]`; `fields` are the common fields.

### D4. Scalar value object: `value-object Name: Type`

```
value-object CorpusVersion: string
value-object ContentHash: string [pattern "^[0-9a-f]{64}$"]
value-object ConstructId: string
```

A value object written with `: Type` is that scalar: its value is the bare string (number, code set …), not an object. It names a type the model reuses, carries a pattern once, and is the typed reference (D10). A one-field value object (`value-object CorpusVersion` / `value: string`) keeps its meaning: an object with a `value` property. A model that means a scalar says so with the new form. IR: `ValueObjectDefinition.scalar?: FieldDefinition` (named after the value object), `fields: []`.

### D5. Mutually exclusive fields: `a: T | b: U` on one line

```
event PlacementMarkedStale
  proposal: ProposeId | gap: GapKey
  cause: "SubjectChanged" | "Mooted"
  n: number
```

Two or more whole field declarations joined by `|` on one field line: exactly one of them is present. It keeps the payload flat, as the spec writes `{proposal | gap, cause, n}`; a nested union (D3) is the form when the alternatives carry several fields each. A member may not be marked `?` (V54). IR: each member is a `FieldDefinition` with `required: false` and `exclusive: [names of the group]`, so a consumer that ignores `exclusive` sees two optional fields.

### D6. Map: `T{}` or `T{key}`

```
replayPoint: number{stream}
```

A map from a string key to `T`, the companion of `T[]`. The optional name in the braces says what the keys are (`stream`) and is carried as documentation (`x-key`). JSON object keys are strings, so the key type is not written. IR: `map: { key?: string }`; `type` is the value type and `isArray` stays `false`.

### D7. Field attributes: `[pattern "…"]` and `[encrypted]`

```
contentHash: string [pattern "^[0-9a-f]{64}$"]
rationale: string [encrypted]
```

Written after the type, in any order and together with the existing `[deprecated "…" -> "…"]`. `[pattern "<regex>"]` applies to a string-valued field (for an array or a map, to each item); the regex is ECMAScript, written as a Moment string (a backslash is written `\\`). `[encrypted]` says the field is recorded encrypted: its recorded value is `{dataKeyId, ciphertext}` and its schema carries `x-encrypted: true` (the founder's ruling). Formats need no syntax: `UUID`, `DateTime` and `Date` already are formats (D8).

**Free text is not a separate attribute.** `[encrypted]` is the only thing a model says about a free-text field. A sweep that every free-text field is encrypted (Sift's, per the ruling) runs fail-closed on the generated schema: a `type: string` that has no `enum`, `pattern`, `format`, `$ref` to a named scalar, or `x-encrypted` is unconstrained, and the sweep fails until the field is constrained (a code set, a pattern, a typed id) or encrypted. A free-text marker would be one more thing an author can forget; the sweep would have to trust it.

### D8. JSON Schema of every event payload (`@mmmnt/schema`, `moment schema emit`)

`emitPayloadSchemas(ir)` in `@mmmnt/schema` returns one JSON Schema (draft 2020-12) per declared event (aggregate and process events), and diagnostics. `moment schema emit <file|dir> --out-dir <dir>` writes `<Event>.schema.json` per event (stdout as one JSON object without `--out-dir`) and exits 1 on any diagnostic. Mapping:

| Moment                        | JSON Schema                                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| event, value object (record)  | `type: object`, `additionalProperties: false`, `properties`, `required` (the required fields, in declared order)                                 |
| `x?: T`                       | `x` not in `required`                                                                                                                            |
| `string`, `number`, `boolean` | `type`                                                                                                                                           |
| `UUID`, `DateTime`, `Date`    | `type: string` with `format: uuid`, `date-time`, `date`                                                                                          |
| `Money`                       | `type: number`                                                                                                                                   |
| `"a" \| "b"`                  | `type: string`, `enum: ["a", "b"]`                                                                                                               |
| value object `V`              | `$ref: "#/$defs/V"`, with `V` in `$defs` (every value object reached, transitively)                                                              |
| scalar value object           | its scalar schema, under its name in `$defs`                                                                                                     |
| union value object            | `oneOf`, one closed object per variant: `kind` is `const` the variant's name, the common and the variant's fields, `additionalProperties: false` |
| `a: T \| b: U`                | both in `properties`, neither in `required`, `oneOf: [{required: [a]}, {required: [b]}]` (several groups: `allOf` of such `oneOf`s)              |
| `T[]`                         | `type: array`, `items`                                                                                                                           |
| `T{key}`                      | `type: object`, `additionalProperties: <T>`, `x-key: "key"`                                                                                      |
| `[pattern "r"]`               | `pattern: "r"` (on the items of an array or a map)                                                                                               |
| `[encrypted]`                 | `x-encrypted: true`, `type: object`, `additionalProperties: false`, `required: [dataKeyId, ciphertext]`, both strings                            |
| `[deprecated …]`              | `deprecated: true`                                                                                                                               |

A type name that is neither built in nor a declared value object is a diagnostic, never an open schema. A value object name declared in two contexts resolves to the one in the event's own context first.

### D9. The rest of the pipeline

- `emit-ts`: an optional field is `?` (already); a code set is a union of string literals; a map is `Readonly<Record<string, T>>`; a scalar value object is a type alias; a union value object is a discriminated union on `kind`. An encrypted field keeps its domain (plaintext) type: the TypeScript types the domain value, the JSON Schema the recorded payload.
- `derive` (scenario payloads): a code set samples its first value; a map samples `{}`; of an exclusive group only the first member is written. Nothing else changes.
- Every other consumer reads the new IR keys or ignores them: they are optional and absent unless the syntax is used.

### D10. No reference type

A reference to another construct (`proposal`, `gap`, `waiver`, `construct`) is a scalar value object (D4): `value-object ConstructId: string`, then `construct: ConstructId`. The schema names it (`$ref: "#/$defs/ConstructId"`), the TypeScript names it, and a pattern can be put on it once. A `ref <Aggregate>` type would add a keyword and a resolution rule (an aggregate's identity field, across files) for what a named scalar already says; Sift's model already declares `ConstructId`, `ProposeId`, `CycleId` and `DataKeyId` for the purpose.

### D11. Validation

Decidable in one file, so errors per file and over a project:

- **V52** A union variant, or a common field of a union, declares a field named `kind` (the discriminator).
- **V53** A variant name, or a code-set value, appears twice in one union or code set.
- **V54** A member of an exclusive group is marked `?`.
- **V55** A `[pattern]` is not a valid regular expression, or is put on a field whose type is not string-valued (`string`, `UUID`, `DateTime`, `Date`, a code set or a scalar value object of one of these).

### D12. Keywords

`pattern` becomes a keyword and is escaped in `FieldName`, `InputName` and `LaneName`, as ADR-043 did for `outcome`, so a field or a lane named `pattern` still parses. `[encrypted]` is one token, as `[required]` and `[branch]` are. `?`, `{` and `}` are new tokens; no identifier can contain them. TicketWave, every fixture and the Sift model (the copy in `packages/board/fixtures/sift-model`) use none of them outside strings and comments.

## Consequences

- A Moment model can state a closed payload contract, and `moment schema emit` gives it to a consumer with no overlay. Sift's D6 generator reads `model/` alone.
- Contract changes are additive: `FieldDefinition` gains optional `enum`, `map`, `pattern`, `encrypted`, `exclusive`; `ValueObjectDefinition` gains optional `scalar` and `variants`. `required: false` now occurs. A consumer that reads `required` (AsyncAPI, the harness, the spec document, `schema status`) already handles it.
- Cost: grammar, IR, four rules, a new emitter and a CLI subcommand, emit-ts and the sample generator. `ast.ts` and `grammar.ts` regenerate.
- Risk: `kind` as the fixed discriminator. A union whose spec names its tag otherwise must use `kind`; a later ADR can add a `tag` clause if a model needs one.
- Risk: the scenario generator samples unions as the first variant only; a scenario does not exercise every variant. That is the payload sample, not a test of the union.

## Migration

**Not breaking.** Every `.moment` file that parsed under 0.11.0 parses to the same IR, and `parse`, `test`, `simulate --all`, `derive`, `generate` and `emit-ts` write the same output, byte for byte, for TicketWave, every valid fixture and the Sift model copy (D-test "golden compat"). Sift's convergence gate (`moment parse`, `moment test`, `moment simulate --all`, then `reach.py` and `exercise.py` over the simulate output) therefore gives the same verdict until the model is edited to use the syntax.

## Rejected alternatives

1. **Optional as an attribute (`billingEventId: string [optional]`).** Consistent with `[required]` on crossing contracts, but the spec of record already writes `name?`, and so does every reader's TypeScript.
2. **Bare-name code sets (`kind: user | api | system`).** Ambiguous with a union of value objects, and breaks on codes that are keywords or contain spaces.
3. **New declaration keywords `enum` and `union`.** Two more reserved words for what the palette calls value objects; the scalar and variant forms of `value-object` say the same with none.
4. **An untagged union of value objects (`trigger: Pointer | RecordRef | EventRef`).** `RecordRef` and `EventRef` have the same fields, so `oneOf` would match both; a value needs its tag.
5. **A `ref <Aggregate>` type.** See D10.
6. **A `[free-text]` attribute.** See D7: the encryption sweep is fail-closed on unconstrained strings instead.
7. **Changing the meaning of a one-field value object to a scalar.** It would change the payload of every existing model that has one; the scalar form is explicit instead.
8. **A general constraint language (`min`, `max`, `minLength`, `format "email"`).** No model of record needs it; a pattern covers the measured cases.

## Enforcement and tests (test-first)

| Spec                                                                                                                                                      | Fails before because | Proves after                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------- |
| `core` parser: `?`, literals, variants, scalar value object, exclusive group, map, `[pattern]`, `[encrypted]`, keyword `pattern` as a field and lane name | parse error          | parsed; the IR carries each key                                                                 |
| `core` validation: V52–V55                                                                                                                                | no rule              | an error per rule, nothing on the valid fixture                                                 |
| `schema` emitter: the fixture `fixtures/valid/field-types`                                                                                                | no emitter           | each row of D8, `additionalProperties: false` on every object, a diagnostic for an unknown type |
| `cli` `schema emit`                                                                                                                                       | no subcommand        | one file per event, exit 1 on a diagnostic                                                      |
| `emit-ts` and `derive` on the fixture                                                                                                                     | no such types        | literal unions, records, discriminated unions; samples are valid against the emitted schema     |
| Golden compat: TicketWave, every valid fixture, the Sift model copy                                                                                       | n/a                  | IR and every CLI artifact byte-identical to 0.11.0                                              |
