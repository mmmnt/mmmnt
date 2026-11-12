# ADR-048: Board frames follow the Sift reference execution

- **Status:** Draft (awaiting the founder's flip to Accepted)
- **Date:** 2026-11-12
- **Supersedes:** the layout parts of ADR-047 only: D2 (the frame list and the SVG form), D3 (the lane form and the chip carrier of the constructs) and open question 5 (the frame inventory). ADR-047 D1 (the package, IR in, no I/O in the library), D4 (the command and its determinism), D5 (the closure obligation, extended here) and the manifest contract stand.
- **Founder rulings (flmnt, quorum workspace bc674142, verbatim labels):** 808fc988 (2026-11-11) "Draft it as recommended (Recommended)" and "Put them in the model (Recommended)", which took every recommendation of §5 and §6 of the Sift board review. Platform workspace d6dd5b65: 796273c7 (2026-11-11): "don't take NDD as doctrine"; "interaction + context lanes are not required as long as the domain design is illustrated much like it is in Sift boards"; "yes, frames need to be numbered because there's going to be a relationship between flows (moment files), ndd boards, and supporting documentation". Standing: 378cdad7 (the board projection is platform tooling), da9b33ea (render, and diff against the board of record), 324322a8 and a111fa59 (swatches and the ADR-040/041 uses, kept as data).
- **Release:** 0.11.0, with ADR-047 (neither is published yet).
- **Numbering:** next free after ADR-047.
- **Source read:** the Sift board uXjVEcdo540= (3451 items, 42 frames) through the review `sift-board-reference.md` (2026-11-11); `/sift/model` (manifest.yaml, 15 flows `T<n> — …`, moments `T<n>.M<k> · …`, 5 contexts), read only; ADR-047; `packages/board/src` at 06da378.

## Context

ADR-047 drew a thread frame from the NDD lane template: one row per flow lane, a chip under each sticky, a legend left to the board. The founder has since ruled that NDD is direction, not doctrine, that the INTERACTION and CONTEXT lanes are optional, that every frame is numbered, and that Sift's latest board is the reference execution for a complex design. The Sift board is built from Moment flows (its own history: 11-07 "Redraw from moments"), so its layout is what the IR can carry: moments as columns, a sub-row per touched context, a SYSTEM stack, a BRANCH row of refusals with a table of arms, a terminal banner, continued columns, and the number in the model text.

What the review found the renderer lacking, by weight: no numbers; context frames that stack every aggregate and construct in one frame where Sift has a caption frame, a frame per aggregate and a Services frame; no Projection & Query, Policies or Coverage frames in Sift's form; chips where Sift writes into the sticky; a single `translate(0,0)` frame per file with no board grid; refusals drawn only in context frames; no branch table, terminal banner or continued columns; no Legend or Grammar.

The IR carries no file path, no manifest order and no number (`FlowDefinition`: id, name, description, lanes, moments, connections), and no spec pointer. ADR-047 D1 keeps the library free of the file system.

## Decision

### D1. The frame inventory

Frames, in this order, each an SVG file and a manifest entry. Ids are stable and `number` is the frame's number where it has one.

| Frame id             | One per                      | Content                                                                                                                                                                                                                                         |
| -------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `legend`             | board                        | the swatches (named sticky colour and exact hex), the reading order; generated from the palette data                                                                                                                                            |
| `grammar`            | board                        | the board's rules (columns are moments, time flows left to right, every thread ends at a terminal banner, the spec-truth law, provenance), the thread index from the flows, and the USES table of D3; generated, never hand-written per product |
| `context-map`        | board                        | externals along the top, contexts in the middle (`C1 Name (Class) - aggregates`), relationships as labelled connectors                                                                                                                          |
| `context-C<i>`       | context                      | caption frame: `C<i> Name - Class`, the context's description                                                                                                                                                                                   |
| `aggregate-<Name>`   | aggregate                    | the commands column, the aggregate as an outlined container holding its refusals and invariants, the events column, command to aggregate to event connectors                                                                                    |
| `services-C<i>`      | context with domain services | domain services and orchestrations                                                                                                                                                                                                              |
| `projection-query`   | board                        | every projection and query with its sources and reads                                                                                                                                                                                           |
| `policies`           | board                        | one band per context, a sticky per policy                                                                                                                                                                                                       |
| `invariant-coverage` | board                        | the text table of D3 with a count header                                                                                                                                                                                                        |
| `thread-<number>`    | flow                         | the thread frame of D4                                                                                                                                                                                                                          |

Frames with nothing to draw (a context with no services) are omitted. The context map has no stores row and no consumers: the IR carries neither.

### D2. Placement: a deterministic grid

The manifest gains a `placement` (x, y, width, height) per frame, and a `board.svg` holds every frame at its place; the per-frame files stay (each at its own origin) so one frame can be loaded alone. Rows, as Sift's: legend, grammar and context map on the first row; caption and aggregate frames on the second; services on the third; projection, policies and coverage on the fourth; thread frames below in two columns, in number order. Gutters are fixed, sizes derive from content, and the same IR gives byte-identical files (ADR-047 D4 stands). Every frame ends with a fixed free band that the generator never fills (D6).

### D3. Text folded into the sticky; the USES table is normative

No chip widget is drawn. What ADR-047 carried as a chip is text in the sticky, as the Sift Grammar's "ADR-040/041 USES" paragraph writes it. The package carries this table as data, and a spec fails when a sticky and the table disagree.

| Construct              | Sticky text                                                                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| command                | `Name [Cause]`, then `emits A, B` (siblings comma-separated); alternatives `emits A when S \| A, B when T`                                                |
| process-owned event    | `Name [Process: Owner]`                                                                                                                                   |
| policy                 | `Name`, then `trigger E [when f = v] -> Command`; `[after E]` for an `after` condition                                                                    |
| refusal                | `Precondition - Command`, then `[Cause]` when scoped, then the rule text                                                                                  |
| note                   | `[Lane label] text`; a note with no lane, or for an External lane, is a person note                                                                       |
| terminal               | the last sticky of the terminal moment ends `/ TERMINAL` (an `[outcome]` and a `[terminal]` look alike on the sticky; the table of arms tells them apart) |
| optional, multiplicity | `[optional]`, `[x3]` after the name (Sift is silent; the form follows the cause bracket)                                                                  |

Colour. Stickies are native stickies with the nearest named Miro colour, and the Legend prints the exact hex beside each, as Sift's does: Moment `blue` (#9ea9ff), Command `light_blue` (#a6ccf5), Event `orange` (#ff9d48), Policy and orchestration `violet` (#c6a2d2), Projection `pink` (#f0939d), Refusal, invariant and rule `light_yellow` (#fff9b1), Query `light_green` (#93d275), Action and person notes `yellow` (#f5d128), lane notes `gray`. Externals (#ffcee0), contexts (white with a black outline), data stores (#67c6c0) and services (#000000) are shapes with exact hexes. The nearest-name table is fixed in the package and tested, so a change of mapping is a visible diff. Data Store and Component are added to the swatch table as optional entries (the Sift legend has them; ADR-047's ten stand).

### D4. The thread frame

Title `N<k> - Title` with a one-line sub-line; columns are moments (id and title above a Moment-coloured sticky), pitch fixed; rows are only those the flow has:

- INTERACTION, drawn only when the flow has a person note (a note with no lane, or an External lane) or an External entry; otherwise absent.
- one sub-row per context the flow touches, holding the moment sticky of the moments that happen there;
- SYSTEM: the nodes of a column stacked vertically with short connectors for same-moment hops (command, event, policy, command) and flow connectors across columns;
- BRANCH: one refusal sticky per precondition of a placed command, joined from the moment sticky by a dashed connector, and under the table a three-column table `ARM | SPEC LINES | EXIT` with one row per arm (`N1.M2-B1 <condition>`, pointers, `[outcome]` or `[terminal]` and the node it ends at). An arm with no entries is the main path continuing; the first such arm is not a row.

An anchored branch moment is two columns, `(continued)` and `(continued, main path)`, as the model writes them (the Sift model declares them as `[branch]` moments); a terminal moment gets a black banner above its column. Counts (moments, arms, refusals) are printed on the frame from the same IR walk.

### D5. Closure, extended

ADR-047 D5 stands (the sweep, and every valid fixture through the package). It gains:

1. the sweep covers refusals (preconditions), notes, arms and the ids of D7: a path of the IR that feeds one of them and is not carried fails the sweep;
2. a golden render (the SVGs and the manifest) of the Sift model beside TicketWave, under `fixtures/` so a change of layout is a visible diff;
3. a parity test: each `(kind, name, context)` of the Sift model's definitions appears in the manifest;
4. re-introduction tests, each removing one rule and failing a spec: the numbering resolution, the table of arms, the terminal banner, the continued columns, the first-empty-arm rule, the optional INTERACTION row.

### D6. What the generator never makes

Hotspot, RULED and DISCOVERED stickies are never generated: they are workshop artefacts with no IR source, and the Legend prints their entries. Each frame ends in the free band of D2 for them. Regeneration targets generated items only: every node in the manifest has a stable `key` (`frame|kind|name|context|momentId|arm`), and a tool that updates a board addresses those keys alone, so it cannot touch a sticky it did not make. Writing to Miro stays outside this package.

### D7. Numbering

Every flow, context and moment carries an id token read from the model.

- **Flow.** A leading token in the flow name: `^<letters><digits>` followed by a separator (`-`, an en or em dash, `·`, `:`), for example `N1 - First memory in minutes` or `T1 — Your workspace gets Sift`. The frame is `thread-N1` and its title `N1 - …`. The prefix letters are read from the model (flmnt `N`, Sift `T`), never fixed in the package; two flows of one model with different prefixes are allowed and sort by prefix then number.
- **Failure.** A flow with no id token, or two flows with one id, fails `moment board` with exit 1 and nothing written, naming the flow. A frame is numbered or there is no board.
- **Moment.** The token of the moment name (`N7.M3 · …` gives `N7.M3`). A moment with no token takes `<flow id>.M<position>`, and the manifest records `momentIdSource`. A `(continued)` moment repeats its token, as the Sift model does; its column title carries the suffix.
- **Arm.** `<moment id>-B<i>`, `i` counting the arms of the moment without the empty main-path arm.
- **Context.** `C<i>`. A context whose name carries a token uses it. Otherwise the number is the context's position in `manifest.yaml`, because the Sift board's C1 to C5 are exactly that order and the IR carries no order of its own; the CLI reads the manifest and passes the order to the library as an option. With no manifest the number is the position in the loaded order, and the manifest records `numberSource` (`name`, `manifest` or `load-order`) so a consumer can see the number is positional.
- **Manifest, additive.** `frames[].number` and `frames[].numberSource`, `nodes[].momentId`, `nodes[].arm` (the arm id; the existing `arm` field of ADR-047, the condition, becomes `armCondition`), `nodes[].key`, `frames[].placement`. `manifestVersion` stays 1: ADR-047's manifest is unpublished and has no consumer, so changing its fields is not a break. If 0.11.0 ships before this ADR is built, the version becomes 2.

### D8. Spec pointers, from an optional sidecar

Sift prints `S:n` under each sticky and in the table; the IR carries none. `moment board --pointers <file>` reads a JSON file `{ "pointers": [ { "momentId"?, "kind", "name", "context"?, "pointer" } ] }`, joined on `(momentId, kind, name)` or `(kind, name, context)`. The pointer is a 11-point grey line under the sticky and a cell of the table and the manifest. Without the option nothing is drawn. A pointer that matches no node fails the command (exit 1), so a stale pointer is not dropped silently. The vocabulary of a pointer is the product's (a PRD row, an ADR id); the package does not interpret it.

### D9. Out of scope

Hand-off terminals (`Tn.Hk`): no Moment construct carries them and none is inferred from `[terminal]`. The 1:1 diff stays a follow-up ADR (ADR-047), with the Sift count-plus-key form as its model; the manifest prints counts per frame so a board and its manifest can be read side by side.

## Consequences

- The frame ids, `nodes[].frame` values and file names of ADR-047's render change; nothing depended on them. Both ADRs ship in 0.11.0.
- A model must number its flows. flmnt does so in its own text (`N1 - …`, `N<k>.M<j>`; ruling 808fc988, a model-text change under the grammar-alignment terms), which is the reason the number lives in the model and not in a file name.
- Many more items per board (Sift's thread T4 has 219); that is the depth the founder asked for. Time to render is linear in the IR.
- The package's palette grows from ten to twelve swatches (data store, component), both optional.
- A change of any layout rule is a golden-file diff.

## Rejected alternatives

1. **Keep ADR-047's lane form.** It forces rows the design may not have and has no room for the depth the Sift reference shows; the founder ruled the lanes optional (796273c7).
2. **Amend ADR-047 in place.** It is Accepted; its D1, D4, D5 and the manifest contract stand. A superseding ADR leaves the record of what changed and why.
3. **A grammar construct for numbers** (`number N1`, an `id` clause). A grammar, corpus and implementation change under the closure law for a presentation key, when the name string already carries it in both reference products and survives every consumer.
4. **Numbers derived from file names** (`n01-…`). The IR has no file path, so the CLI would have to pass numbers in and the library could not number alone; a renamed file silently renumbers; the number would not be in Facet or the docs that read the flow name. Considered as a fallback and refused: an unnumbered flow is an error.
5. **Numbers from position.** A reordering renumbers every frame and the documents that cite it. Used only for context numbers, where the Sift board itself does it, and recorded as such.
6. **Chips as separate widgets.** Heavier than Sift's text and a second carrier for the same facts; text in the sticky is editable and is what the USES paragraph writes.
7. **Hex shapes for every node.** Exact, but not native stickies: not editable as notes, not text-fit. Native stickies with printed hexes are Sift's own compromise.
8. **Generate hotspot, RULED and DISCOVERED stickies.** No IR source; inventing them would put the generator's words in the workshop's voice, and a regeneration could overwrite a hand-made one.
9. **One frame per context holding everything** (ADR-047). Does not scale to a context of eleven aggregates, and does not match the board of record.
10. **Infer hand-off terminals from `[terminal]`.** A different fact; a guess presented as a model fact.

## Open questions (each with a recommendation)

1. **Context numbers without a token or a manifest.** Recommend: load order, recorded as `numberSource: load-order`, with a diagnostic on stderr; flmnt's contexts are C1 to C8 by its own ruling, so it should carry the numbers in its context names or its manifest.
2. **A moment with no id token in a numbered flow.** Recommend: position fallback (`<flow id>.M<j>`), recorded as such, not an error: the ruling numbers frames, and failing a whole board for an unnumbered moment is harsher than the diff needs.
3. **Omit empty frames (a context with no services, no policies).** Recommend omit, except the singletons, which always draw so the Legend and the thread index are never missing.
4. **Stable key and regeneration.** Recommend the manifest `key` of D6 and nothing more here; the tool that rewrites a board against it is a later ADR with the diff.
5. **Pointer sidecar shape.** Recommend D8's JSON with the failing mismatch; flmnt chooses its vocabulary (PRD rows).
6. **Sticky colour table.** Recommend the fixed nearest-name table of D3, confirmed once against the board of record's own named colours.
7. **Optional swatches (data store, component).** Recommend carry them in the table; the generator draws the service shape black and uses the data-store swatch only if a later construct supplies a store.

## Enforcement and tests (test-first, after the flip)

| Spec                                                                                      | Proves |
| ----------------------------------------------------------------------------------------- | ------ |
| numbering: name token, prefix read from the model, unnumbered and duplicate flows exit 1  | D7     |
| numbering: contexts by token, manifest order, load order, each recorded in `numberSource` | D7     |
| the USES table, one case per row                                                          | D3     |
| the table of arms, with an empty main-path arm                                            | D4     |
| the terminal banner and the continued columns on the Sift model                           | D4     |
| INTERACTION row present only with a person note or External entry                         | D4     |
| grid placement determinism, and `board.svg` equals the per-frame files at their places    | D2     |
| pointer sidecar: joins, and a stale pointer exits 1                                       | D8     |
| golden render of the Sift model and TicketWave                                            | D5     |
| parity: every `(kind, name, context)` of the Sift model is in the manifest                | D5     |
| closure sweep over refusals, notes, arms and ids                                          | D5     |
| re-introduction: each rule removed fails a spec                                           | D5     |
