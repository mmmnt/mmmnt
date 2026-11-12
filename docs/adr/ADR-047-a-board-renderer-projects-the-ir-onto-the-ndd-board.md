# ADR-047: A board renderer projects the IR onto the NDD board

- **Status:** Accepted (2026-11-11, founder, "Accept as recommended (Recommended)", flmnt decision in bc674142). Rulings: (1) the package is `@mmmnt/board`; (2) the 1:1 diff is deferred to a follow-up ADR; (3) the package ships in the fixed group at 0.11.0; (4) the diff compares manifest nodes only, with no position tolerance. The frame inventory of open question 5 is kept; the coordinator checks it against the live board before anything is placed there.
- **Date:** 2026-11-12
- **Supersedes:** nothing. Adds a package and a CLI command; changes no grammar, no IR field, no validation rule and no existing output.
- **Founder rulings (flmnt, quorum workspace bc674142, verbatim labels):** 2e061a07 (2026-11-11) "Render + diff (Recommended)"; 129799c3 (2026-11-11) "Moment repo package (Recommended)": "The .moment -> Miro renderer is a new package in the Moment repo, beside viz/serve, under Moment's own process (ADR, closure law, changesets). The palette rules stay in the platform workspace." Platform workspace d6dd5b65: da9b33ea "Render + diff", under 378cdad7 (the board projection is platform tooling, outside SiDD and Sift).
- **Release:** 0.11.0 (minor; new package joins the fixed `@mmmnt/*` group).
- **Numbering:** next free after ADR-046.
- **Source read:** `packages/core/src/ir/*` (IR types), `packages/viz/src` (renderers, server), `packages/cli/src/commands/{viz,serve}.ts`, `docs/palette-delta-040.md`, `docs/palette-delta-041.md`, `.changeset/config.json`; platform entries 324322a8, a111fa59, 378cdad7, 4663e451, 0a5603d3, c2a406f3, 122d7860; Sift `spikes/eval-harness/render_board.py` and `render_design.py` (read only).

## Governance finding

An ADR is required. Evidence: the ruling itself names ADR, closure law and changesets; Moment adds a package for every new output surface under an ADR (ADR-006 absorption, ADR-031 serve); `.changeset/config.json` fixes every `@mmmnt/*` package into one version group, so a new package changes the release surface; and CONTRIBUTING.md requires a changeset for a published package. Note for the reviewer: I found no written "closure law" in the repository (the only hits are the word "VenueClosure"), and ADRs 001 to 039 are not in this tree (the index lives in Confluence, space MMMNT). This ADR therefore states its own closure obligation in D5 and leaves the binding wording of the law to the founder.

## Context

The platform's NDD board in Miro is the board of record for a product. After the model converges, step 5 of the platform chain (9202b85c) writes `.moment` and checks it against the board: every event, command, aggregate and flow in the same context, both ways, diff empty before the spec layer opens. Today that check is by eye. Moment draws two things, `moment viz` (context map and flow timeline, its own look) and `moment serve` (Facet's live envelope), and neither uses the NDD palette or produces something a board diff can read. Sift's `render_board.py` draws the other way (a Sift run to SVG).

The renderer is internal platform practice (378cdad7: "we cannot force our tooling opinionation on where we project our designs to Miro"), and the founder placed it in the Moment repo (129799c3). The palette rules stay in the platform workspace; the package carries the swatches as data, with the source entry ids.

## Decision

### D1. A new package `@mmmnt/board`

Input is `IntermediateRepresentation` from `@mmmnt/core`, never `.moment` text, so the grammar is parsed once. Depends on `@mmmnt/core` only (no Miro SDK, no network, no filesystem in the library; the CLI writes files). Pure functions: `projectBoard(ir, options) -> BoardProjection`, `renderFrameSvg(frame) -> string`, `buildManifest(projection) -> BoardManifest`.

### D2. Output is files only

- one Canvas Composer SVG per frame: one per context (aggregates as outlined white containers, commands, events, policies, projections, queries, rules, externals, in palette colours), one per flow (thread frame with INTERACTION / CONTEXT / SYSTEM / BRANCH lanes, moments as columns, left to right), a Context Map frame and an Invariant Coverage frame;
- `manifest.json`: every node with `kind`, `name`, `context`, and `flow` and `moment` where it is placed, plus `frame` and the IR path it came from. The manifest is the diff's input: a diff tool reads a board-of-record export in the same shape and compares by `(kind, name, context)` both ways. The diff itself is out of scope here (see Open questions).

The renderer never writes to Miro. Loading the SVGs onto a board is a separate act, drawn beside the board of record and never over it (da9b33ea).

### D3. Palette and constructs

Swatches (378cdad7, 324322a8): Moment `#9ea9ff`, Interface `#f5f6f8`, Action `#f5d128`, Refusal `#fff9b1`, Policy `#c6a2d2`, External `#ffcee0`, Command `#a6ccf5`, Event `#ff9d48`, Projection `#f0939d`, Query `#93d275`. Constructs handled (a111fa59, ADR-040/041/043/045): note moments (drawn as a note, no node), triggered-by and same-moment hops (a connector with the cause, none between siblings), sibling events of one command (side by side, no arrow between them), alternative-outcome groups (one group per arm with its state chip), branch arms and `[terminal]` outcomes in the BRANCH lane, policy conditions (a `when` / `after` chip on the policy), cause-scoped refusals (refusal sticky carrying the cause chip). Process-owned events and multi-event emits are in the IR, so they render; the flmnt model not adopting them (2e061a07) does not limit the renderer.

### D4. Command `moment board <path> --out <dir> [--frame <name>]`

Beside `viz`, same loader (`loadSpecification`, project mode per ADR-038), same diagnostics handling: a model that does not parse or validate produces no board and exit code 1. Layout is deterministic (no timestamps, no random ids), so the same IR gives byte-identical files and a board regeneration is diffable.

### D5. Closure obligation

Moment's closure law is grammar + corpus + implementation + full corpus re-validation in one change (flmnt decision 41f95b15; ADR-037's implementation c77944c5). This ADR changes no grammar, so its closure statement is:

1. A sweep walks the property paths of real IR instances and fails when a path is neither drawn nor listed in the manifest under `unrendered` with its reason, so a construct added to the IR later cannot be skipped silently. It is a walk of the IR, not a hand list.
2. Every model in `fixtures/valid` (TicketWave included) is rendered through the package in the same change and must produce a manifest with no uncovered path.

### D6. Prior art is reused for layout and colour, not copied wholesale

Sift's `render_board.py` and `render_design.py` give the lane geometry, frame sizes and the sticky look. The package reimplements them in TypeScript against the IR; it reads no Sift record, imports nothing from Sift, and Sift is not edited.

## Consequences

- One new package and one CLI command; the `@mmmnt/*` group version moves to 0.11.0 with a changeset.
- `moment viz` and `moment serve` are unchanged.
- The manifest becomes a contract the platform's diff depends on: its shape is versioned (`manifestVersion: 1`) and changed only by an ADR.
- Testing: golden SVG and manifest for the TicketWave example and a fixture holding every ADR-040/041/043/045 construct; a parity spec that the manifest's node set equals the IR's constructs; a reintroduction check per construct (each handled construct removed from the renderer fails a spec).

## Rejected alternatives

1. **Extend `@mmmnt/viz`.** viz is platform-agnostic and has its own look; adding an opinionated palette and Miro-shaped output to it forces the opinion on every viz user (378cdad7). A separate package keeps the opinion removable.
2. **Keep it in the platform or flmnt repo, as the Sift spike did.** Overruled by 129799c3; it would also mean parsing the grammar a second time or reading the text, which the ruling forbids.
3. **Read `.moment` text or `moment parse` JSON.** A second parse of the grammar; the IR is the contract.
4. **Write to Miro directly (REST or MCP).** Couples the package to a credential and a board, and the ruling says output is files only and drawn beside the board of record. Files can be loaded by an operator or agent with the Miro tools.
5. **Facet as the home (roadmap item, 20123eca).** A future home for the community projection, not this renderer; the package stays data-driven and product-neutral so it can move.
6. **A flag on `moment viz` instead of a new command.** viz emits its own JSON envelope; a different output set under one command blurs its contract.
7. **Ship the diff in the same package.** The ruling makes the renderer the mechanical half of the check; the board-of-record read (a Miro export) is a different input with its own failure modes. Split so each can be specified alone.

## Open questions (each with a recommendation)

1. **Package name: `@mmmnt/board` or `@mmmnt/ndd`?** Recommend `@mmmnt/board`: it names what is made; NDD is the palette inside it, and the palette rules belong to the platform.
2. **Is the 1:1 diff in this ADR's scope?** Recommend no: this ADR ships the renderer and the manifest; a follow-up `moment board diff <manifest> <board-export>` gets its own ADR (ruled) once the board-of-record export shape is read from Miro and pinned.
3. **Where is the binding text of the closure law?** I could not find it in the repo (Confluence index not read). Recommend the founder point to it, or accept D5 as the closure statement for this package.
4. **Release coupling.** The group is fixed, so the package ships at 0.11.0 with the rest. Recommend accepting that; an unpublished (`private`) package until the manifest is proven against the flmnt board is the alternative if the founder wants no public surface yet.
5. **Frame inventory to match uXjVEXfeXOk=.** Recommend: context frames, thread frames per flow (N1 to N12 are the flmnt flows in order), Context Map, Invariant Coverage; the legend frame is omitted (it is the board's own). The founder confirms against the live board.
6. **Layout stability for the diff.** Positions are not diffed, only the manifest nodes. Recommend that and no position tolerance.

## Enforcement and tests (test-first, after the flip)

| Spec | Proves |
|---|---|
| swatch table | each kind draws its ruled hex |
| closure sweep over IR types | no construct silently skipped |
| fixture with every ADR-040/041/043/045 construct | each is drawn as D3 states and appears in the manifest |
| determinism | same IR twice gives byte-identical files |
| invalid model | no files, exit 1 |
| reintroduction | removing any construct's rendering fails a spec |
