# ADR-051: Any keyword may name a field, an input or a lane

- **Status:** Proposed
- **Date:** 2026-11-16
- **Supersedes:** nothing. Generalises the keyword escapes of ADR-037 (§2), ADR-040, ADR-043 D1, ADR-045 and ADR-049 D12 into one rule, and lifts the refusal of a field named `when` that ADR-041 pinned in a test.
- **Founder ruling (Sift workspace 729c1a1d, flmnt decision 8b471058, verbatim label):** "Moment allows any keyword (Recommended)": a generic change so that any Moment keyword is accepted wherever a field name (and input name; lane names if consistent) is expected. The standing rule for Moment work (flmnt decision 0b837d08) applies: no extension specific to Sift's use case.
- **Release:** proposed 0.14.0 (minor) for the `@mmmnt/*` fixed group. Nothing is published by this branch.
- **Numbering:** next free after ADR-050.
- **Source read:** `origin/main` 237cfff (Moment 0.13.0): `packages/core/src/grammar/moment.langium`, `parser/ast-to-ir.ts`, `validation/policy-condition.ts`, `emit-ts/src/services/typescript-emitter.ts`, `schema/src/services/payload-json-schema.ts`, `generate/src/services/asyncapi-generator.ts`, `derive/src/engine/simulation-scenario-generator.ts`; ADR-037 to ADR-050.

## Context

Every word the grammar reserves is a token of its own, so a field named `scope` lexes as the keyword `scope` and does not parse as a name. Each ADR that added a keyword escaped that keyword by hand: ADR-037 let `FieldName` take the words that cannot begin a declaration (`sources`, `field`, `reads`, `enforced-by`, `state`, `initial`, `issues`, `gateway`, `none`, `invoked-by`) and let `InputName` also take `projection`, `query`, `rule` and `term`; ADR-040 added `cause`, `causes` and `note`; ADR-043 `outcome`; ADR-045 `after`; ADR-049 `pattern`. The rule ADR-037 wrote down ("a field list, which a new declaration can follow, may use only those that cannot begin a declaration") is why the other 65 words stayed out.

The words a domain uses for its fields are not chosen to avoid a modelling language's vocabulary. A specification of record that names a field `scope`, `policy`, `context`, `trigger`, `type`, `state` or `on` cannot be written in Moment as it is; the model renames the field and drifts from its specification, and every consumer of the generated schemas or types sees the renamed field. The measured case is the Sift specification (`RequestRef.scope`, `FailedCommand.policy`, `ConstructState.context`, `CycleStarted.trigger`), but the shape is general: of the 81 words Moment reserves, ordinary domain nouns and verbs are the majority (`context`, `event`, `command`, `policy`, `scope`, `state`, `type`, `trigger`, `action`, `description`, `input`, `contract`, `timeout`, `string`, `Date`, `Money`, ...).

The restriction is no longer needed by the parser. Langium 4.4 parses with ALL(\*) (chevrotain-allstar): a decision looks ahead as far as it must. ADR-037's restriction was about a field list being followed by a declaration whose first word is a keyword; the parser can tell `scope: string` (a field) from `scope Order` (an invariant's clause) by the token after the word.

## Decision

### D1. Syntax: one reserved-word rule, used by every name position

```
ReservedWord returns string:
    'AnticorruptionLayer' | 'Conformist' | ... | 'value-object' | 'via' | 'when';   // every word keyword

FieldName returns string:  ID | ReservedWord;
InputName returns string:  FieldName;
LaneName  returns string:  ID | ReservedWord;
```

`ReservedWord` lists every keyword of the grammar that has the shape of an identifier: 81 words in 0.13.0 (the 65 lower-case declaration and clause words, the built-in types `string`, `number`, `boolean`, `UUID`, `DateTime`, `Date`, `Money`, the classifications `Core`, `Supporting`, `Generic`, `Terminal`, `External`, and the relationship types). The positions that take a name, and so take any of them:

| Name                | Positions                                                                                                                                                                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Field (`FieldName`) | an event's fields, an orchestration's process events, a value object's fields, a variant's fields, the second and later members of an exclusive group (`a: T \| b: U`), an aggregate's `identity`, a projection's `field` lines, and every segment of a policy condition path (D5) |
| Input (`InputName`) | a command's, an orchestration command's and a query's `input` list                                                                                                                                                                                                                 |
| Lane (`LaneName`)   | `lane` / `branch-lane` declarations, node placements (`<lane>: <Node>`), `note <lane>: "…"`, a `when <arm> [<lane>]` route and the `crosses-to <lane>` target                                                                                                                      |

An example: the fixture `fixtures/valid/keyword-field-names` declares

```
  value-object Trigger
    | Scheduled
        timeout: string
    | Manual
        string: string

  aggregate "Job"
    identity jobId: UUID
    command StartJob
      input jobId: UUID, policy: string, scope?: "local" | "global", trigger: Trigger, context: Target
      emits JobStarted
    event JobStarted
      jobId: UUID
      policy: string
      scope?: "local" | "global"
      trigger: Trigger
      context: Target
      type: string [pattern "^[a-z][a-z-]*$"]
      on: DateTime

  policy ScheduledJobFinishes
    trigger JobStarted when trigger.kind = Scheduled
    ...
flow "N1 - A scheduled job starts and finishes"
  lane policy "Dispatch" [Core]
  moment "The schedule starts the job"
    policy: StartJob
```

Lexing does not change: a keyword is still its own token, and `stateful` or `contexts` still lex as identifiers. `ReservedWord` turns the token back into a name where a name is expected. The IR carries the name as written, exactly as it carried `outcome` or `pattern`.

### D2. How the grammar tells a name from a keyword

In every field, input and placement position the name is followed by `:` or by `?` then `:`. No declaration and no clause begins with a keyword followed by `:` or `?`: each keyword that begins one is followed by a name (`event Done`, `command Do`, `policy P`, `scope Order`, `trigger Done`, `state initial Open`, `state Open -> ...`), a string (`context "C"`, `moment "M"`, `flow "F"`, `description "…"`, `note "…"`), another keyword (`state initial`, `compensation none`, `compensation on`) or a lane name (`note <lane>: "…"`). The parser decides on the second token, so a field list still ends at the next declaration, and a moment's body still reads `when a` as an arm and `when: X` as a placement on a lane named `when`.

The other lane positions are fixed by the word before them (`lane`, `branch-lane`, `crosses-to`, `[` after a `when` arm), so any word there is the lane. In a condition path the segments are followed by `.` or `=`.

Three cases need saying:

- **`when`.** ADR-041's spec pinned that an event field named `when` is refused. It is lifted: `when:` is a field, `when Open` after `emits A` is the guard of an outcome. An emits clause is never directly followed by a field list (it ends a command, which is followed by a command, an event, a value object, an invariant, an annotation or the end of the aggregate), so the guard is never read as a field.
- **`note`.** ADR-040 already made `note: Name` a placement on a lane named `note` and `note <lane>: "text"` a note; unchanged.
- **The declaration that follows a field list.** A spec pins that an event's field list named `scope`, `policy`, `context`, `trigger` and `on` still ends at `value-object`, `invariant … scope …`, `command`, `@classification(…)`, `event`, and at the context's `policy`, `projection`, `query`, `rule`, `term` and `service`.

### D3. What is not a name, and why

- **Tokens that are not words.** `[branch]`, `[required]`, `[encrypted]`, the string token `"none"`, `[]`, `×` and the punctuation cannot be lexed as a name, so they cannot be one. Nothing to decide.
- **A crossing's contract fields (`crosses-to <lane> via <Type> contract <name>: <Type> ...`) keep `ID`.** The contract's field list is followed directly by the moment's next placement, `<lane>: <Node>`, which has the same shape as a contract field, `<word>: <word>`. The two are ambiguous for an identifier lane today: `b: Received` after `contract id: string` is read as a second contract field, not as a placement (measured on 0.13.0). A lane named with a keyword is the one placement that can follow a contract unambiguously today (`note: Received`), because a contract field cannot start with a keyword. If contract fields took keywords, that placement would become a contract field and a model that parses today would get a different IR. A spec pins that a placement on a keyword-named lane after a contract stays a placement. A contract field is a name in a contract the crossing restates, not the event's field (which the event declares and which may be named with any word); a later ADR can change the contract syntax if a model needs a keyword there.
- **Other identifier positions** (the names of declarations, types and value objects, variants, aggregate and orchestration states, branch arms, condition values) are not field, input or lane names and keep `ID`, as the ruling asks. A condition value that is a keyword is written as a string, as before (`when scope = "local"`).

### D4. Validation

No new rule and no new diagnostic. A name is checked as the name it is: V49 and V56/V57 resolve a condition path against the trigger's declared fields whatever the word, the duplicate and completeness checks compare names as strings, and V52 still refuses a union's common field named `kind` (`kind` is not a keyword). There is no advisory against a keyword name: the ruling allows them, and a name the specification of record uses is the right name.

ADR-046's branch stamp is unaffected: the stamp is `$branch`, which no name can be, and `outcome` (the legacy stamp, never written over a declared field) was a field name before this ADR.

### D5. Condition paths

`ConditionPath` (ADR-050) is `FieldName ('.' FieldName)*`, so every segment takes any word: `when trigger = Manual`, `when policy = x`, `when trigger.kind = Scheduled`. V56 still requires the second segment to be `kind` on a union field, and V49 checks the first segment. The IR's `condition.field` is the path as written. A value after `=` stays `ID | STRING`.

### D6. Emitters

A field name reaches emitters only as a string in the IR, so the question is whether each emitter writes an arbitrary identifier-shaped name correctly. Checked:

- **JSON Schema (`moment schema emit`).** Names are property keys and `required` entries: JSON strings. `context`, `type`, `on`, `string` are written as they are; a fixture spec checks `JobStarted` and the `Target` and `Trigger` definitions.
- **TypeScript (`emit-ts`).** Names are property names in interfaces and union branches. `safePropertyKey` writes an identifier-shaped name bare and quotes any other (a hyphenated keyword such as `chains-to`, as any hyphenated identifier is quoted today). No Moment keyword is an ECMAScript reserved word, and a reserved word is a legal property name in any case; emit-ts never uses a field name as a binding (a variable or parameter). A spec checks the emitted interfaces and type-checks the context's read-model types with `tsc --strict`.
- **AsyncAPI (`generate`).** Names are YAML mapping keys and list items. `on` is a keyword, and a YAML 1.1 reader takes a plain `on` for the boolean `true` (`yes`, `no`, `off`, `y`, `n` likewise; YAML 1.2 still reads `true`, `false` and `null` as non-strings). The generator now single-quotes a name YAML would read as a boolean or null and writes every other name as before. The words other than `on` were already identifiers a model could use; the same quoting covers them. A spec reads the output with YAML 1.1 and 1.2.
- **Scenarios, topology, harness, Gherkin, specification document, board, viz.** Names are payload keys or text. The simulation stamps (`nodeId`, `processName`, `$branch`, and `outcome` where no field declares it) are not changed and no keyword adds a collision.
- **Syntax highlighting.** The TextMate grammar is lexical and colours a keyword as a keyword wherever it is written, a name included. It is unchanged (the regenerated `moment.tmLanguage.json` is byte-identical).

### D7. Keeping the rule

`ReservedWord` must list every word keyword. A spec reads the keywords from the grammar itself (`MomentGrammar()`) and parses, for each one, a model that uses it as a field, an optional field, a variant field, an exclusive member, an identity, a projection field, a command input, an optional input, a query input, a lane declaration, a placement lane, a note lane, an arm route lane and a condition path's first segment, and checks the IR. A keyword a later ADR adds fails that spec until it is added to `ReservedWord`; no later ADR needs to escape a word again.

## Consequences

- A model can use the names its specification uses. Sift's `RequestRef.scope`, `FailedCommand.policy`, `ConstructState.context` and `CycleStarted.trigger` are written as named.
- The escape lists of five ADRs become one rule. `ast.ts` and `grammar.ts` regenerate; the IR, its types and every artifact of an existing model are unchanged (Migration).
- `generate`'s AsyncAPI quotes a field name that YAML reads as a boolean or null. No existing model has one (the compatibility measurement is byte-identical).
- Cost: one grammar rule, one quoting helper. No new token, no IR key, no rule.
- Risk: a reader may find `policy: string` inside an event surprising beside `policy P` declarations. The position says which it is (a name is always followed by `:`), and the TextMate colouring stays lexical.

## Migration

**Not breaking.** Every word that was a name before is still one, so every `.moment` file that parsed under 0.13.0 parses to the same IR. A file that did not parse because it used a keyword as a field, input or lane name now parses. The one changed test is ADR-041's pin that `when:` is refused as a field name (D2).

## Rejected alternatives

1. **Keep escaping word by word.** Each ADR adding a keyword had to decide and test its escape, and the ADR-037 restriction kept 65 words out that the parser does not need kept out. The ruling chose the general rule.
2. **Escape only the words Sift needs (`scope`, `policy`, `context`, `trigger`).** Specific to one model, which the standing rule (0b837d08) excludes, and the next model brings other words.
3. **A quoting form for names (`"scope": string`, or a back-quoted name).** It works for any word but makes the model text differ from the specification it transcribes, and gives every reader and tool a second spelling of a name.
4. **Contextual keywords in the lexer** (a word is an identifier unless it is in a declaration position). Langium's lexer is context-free; this needs a custom token builder or lexer modes for what the ALL(\*) parser already decides from one token of lookahead.
5. **An advisory on a keyword-named field.** The ruling allows them; a warning on the specification's own names would be noise that authors learn to ignore.
6. **Contract fields too.** See D3: ambiguous with the next placement, and changing them would change the IR of a model that parses today.

## Enforcement and tests (test-first)

Written first, each failing for the right reason on `origin/main` 237cfff:

| Spec                                                                                                                          | Fails before because                                                                                              | Proves after                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `core/__tests__/grammar/keyword-names-adr051.spec.ts`: each of the grammar's 81 word keywords in every name position (D1, D7) | 75 of 81 are parse errors (the 6 already escaped, `after`, `cause`, `causes`, `note`, `outcome`, `pattern`, pass) | parses; the IR carries the word as the field, input, lane and condition name                                              |
| same: a field list named `scope`, `policy`, `context`, `trigger`, `on` still ends at each following declaration (D2)          | parse error                                                                                                       | the fields and the declarations are both in the IR                                                                        |
| same: a keyword-named lane after a crossing contract is a placement (D3)                                                      | (passes)                                                                                                          | still a placement; pins why contract fields keep `ID`                                                                     |
| same: `scope string` (no colon) in a field list is still an error                                                             | (passes)                                                                                                          | still refused                                                                                                             |
| `core/__tests__/grammar/moment-grammar.spec.ts` (ADR-041, amended): `when:` is a field, `emits Done when Open` the guard      | `when:` is a parse error                                                                                          | both read as written                                                                                                      |
| `derive/src/engine/__tests__/simulation-adr051.spec.ts`: the fixture's scenario payloads and `policy-definitions`             | the fixture does not parse                                                                                        | keyword-named fields sampled under their names; `trigger: {kind: "Scheduled"}`; `condition.field` is `trigger.kind`       |
| `emit-ts/src/__tests__/services/typescript-emitter-adr051.spec.ts`                                                            | the fixture does not parse                                                                                        | interfaces carry `readonly policy`, `context`, `type`, `on`, `when`, `timeout`, `string`; the read-model types type-check |
| `cli/src/commands/schema-emit.test.ts` (extended)                                                                             | the fixture does not parse                                                                                        | the payload schemas' properties, `required`, `$defs`                                                                      |
| `generate/src/__tests__/services/asyncapi-generator.spec.ts` (extended)                                                       | `on:` is written plain                                                                                            | `'on':` and `- 'on'`; YAML 1.1 and 1.2 both read the keys as strings                                                      |
| Golden compatibility: TicketWave, every valid fixture, the Sift model copy                                                    | n/a                                                                                                               | IR and every CLI artifact byte-identical to 0.13.0                                                                        |

**Fixture:** `fixtures/valid/keyword-field-names/dispatch.moment` (a generic job dispatcher): fields named `scope`, `policy`, `context`, `trigger`, `type`, `on`, `state`, `when`, `timeout`, `string`; inputs named `policy`, `scope`, `trigger`, `context`, `state`; a lane named `policy`; and a policy guarded on `trigger.kind`.
