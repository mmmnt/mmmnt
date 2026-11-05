# Palette delta 040

Companion to [ADR-040](adr/ADR-040-process-constructs-causes-and-note-moments.md). Status: Proposed. Nothing here is applied.

The delta adds no swatch. It changes who may own an event, and how three constructs use existing swatches. Swatches are those of the platform NDD palette (ruling 324322a8): Moment `#9ea9ff`, Interface `#f5f6f8`, Action `#f5d128`, Business rule/refusal `#fff9b1`, Process/policy `#c6a2d2`, External system `#ffcee0`, Command `#a6ccf5`, Event `#ff9d48`, Projection `#f0939d`, Resolver/query `#93d275`; structural Data Store `#67c6c0`, Component `#000000`.

## 1. What changes on the platform NDD palette (for the platform corpus)

| Palette entry | Today | After |
|---|---|---|
| Event `#ff9d48` | An event belongs to an aggregate. | An event belongs to an aggregate or to a Process. A Process-owned event is the recorded outcome of one of the Process's commands, for example `AdmissionCompleted`. It uses the same swatch. The owner is shown by a Process `#c6a2d2` edge on the sticky, in place of the aggregate marker. |
| Process/policy `#c6a2d2` | A Process (saga) issues commands and compensates, and emits nothing. | A Process may also record outcome events (above). It still issues no aggregate event. |
| Business rule/refusal `#fff9b1` | A refusal is attached to a command and applies to every use of it. | A refusal may be scoped to one or more causes. The sticky carries a cause chip, for example `WithinCancellationWindow [OwnerRequest]`. An unscoped refusal has no chip and applies to every cause. |
| Command `#a6ccf5` | A command is placed in a moment. | A command that can be issued for several causes may be placed for one. The sticky carries the chip, for example `CancelAppointment [OwnerRequest]`. |
| Moment `#9ea9ff` | A moment holds stickies. | A moment may hold only a note: narration of a step outside the model or below its grain. The moment sticky carries the note text in its body and nothing sits under it. A note attributed to an External lane colours that lane label External system `#ffcee0`. |
| Event, Process/policy, Command column | Event, policy and command sit in separate moments in a flow. | They may sit in one moment: Event `#ff9d48`, then Process/policy `#c6a2d2`, then Command `#a6ccf5`, joined by short causal arrows. |

Wording to add to the platform palette text (one sentence each):

- "An event is owned by an aggregate or by a Process; both use the Event swatch."
- "A refusal can be scoped to a cause; the chip names the cause."
- "A moment can be a note: it carries narration and no stickies."

## 2. Moment's own docs and site pages

ADR-038 mapped constructs to palette tabs in the grammar and the README. These files carry that mapping and change. Edits are proposed, not applied.

### `packages/core/README.md`

In the construct table (the row that begins `| Orchestration |`, around line 79), replace the Orchestration row with:

> `| Orchestration | context | `orchestration <Name>` (`saga` is an alias) with its own `command`s, the `event`s those commands emit, `invoked-by`, `issues`, `states`, `compensation` and `timeout`. |`

Add rows below it:

> `| Process event | orchestration | `event <Name>` with fields, declared inside an orchestration. An orchestration command emits it with `emits`. It is a domain event owned by the process. |`
> `| Cause | command, precondition, node | `causes A, B` on a command; `cause A` on a precondition limits it to that cause; `cause A` after a node placement says the command is issued for A. |`
> `| Note | moment | `note "text"` or `note <lane>: "text"`. Narration of a step outside the model. It is not a node and asserts nothing. |`

Add a short section after the example (line ~85 onward), titled "Processes, causes, notes and hops", with the four snippets of ADR-040 (D1 to D4) and one line each saying what they are for.

In the Validation Rules table, add:

> `| V5 | `triggered-by` names a node that appears earlier in the flow in source order, in a prior moment or earlier in the same moment (V43 checks a same-moment target). |`
> `| V10 | A moment contains at least one node, `when` block or note. |`

and, after V39:

> `| V40 | An event is declared by one owner, an aggregate or an orchestration. |`
> `| V41 | A `cause` on a precondition or a placement is one of the command's declared `causes`. |`
> `| V42 | A command with cause-scoped preconditions is placed with its `cause`. |`
> `| V43 | A same-moment `triggered-by` is a hop a policy declares. |`

Reword V31 to: "An orchestration's commands emit only events the orchestration declares, never an aggregate's event." In the API table: add `owner` to the `EventDefinition` description, `causes` to `CommandDefinition` and `PreconditionDefinition`, `notes` to the moment definition, and `cause` to `MomentEntry`.

### `README.md` (repository root, line ~61)

Replace the "Models held to the palette (ADR-038)" bullet with the same bullet plus: "Processes record their outcomes as events (ADR-040), refusals can be scoped to the cause a command is issued for, a moment can be a note for a step outside the model, and one moment can show a whole reactive column of event, policy and command."

### `packages/derive/README.md`

In the part that lists negative scenarios, add: "Preconditions of orchestration commands derive negative scenarios. A precondition scoped to a cause derives only in flows that place the command for that cause."

### `packages/generate/README.md`

Add: "A note renders as a comment line in Gherkin and as a narrated step in the specification document."

### `packages/viz/README.md`

Add: "Facet draws a note-only moment as a bare column with its note, draws a same-moment `triggered-by` as an arrow inside the column, and shows a cause as a chip on a command or refusal."

### `site/src/pages/dsl.astro`

1. `referenceRows` (around lines 90 to 105). Replace the orchestration row's meaning with "A long-running process: issues commands, advances on its own, compensates, and records its outcomes as events." Add rows (same `layer: 'structure'`, `color: '#22D3EE'`, `layerColor: '#5b7077'`):
   - `{ syntax: 'event (in an orchestration)', meaning: 'A fact the process records: the outcome of one of its commands.' ... }`
   - `{ syntax: 'causes · cause', meaning: 'The reasons a command is issued for, and the refusals that apply to only one of them.' ... }`
   Add a temporal row: `{ syntax: 'note', meaning: 'Narration of a step outside the model; a moment can be only a note.', layer: 'temporal', color: '#22D3EE', layerColor: '#22D3EE' }`.
2. Keyword tokens list (around lines 66 to 85): add `{ key: 'causes', label: 'causes' }`, `{ key: 'cause', label: 'cause' }`, `{ key: 'note', label: 'note' }`.
3. The teaching record (around lines 425 to 445). Edit `orchestration`:
   - `tag`: 'long-running process'
   - `syntax`: add a line `event CheckoutCompleted` and `command FinishCheckout emits CheckoutCompleted` to the snippet.
   - `meaning`: append "It can record outcomes as events, which policies and projections can use."
   - `rule`: append "An orchestration command emits only an event the orchestration declares (V31)."
   Add entries `cause` (tag 'who asked · the reason a command runs', syntax `command CancelAppointment<br>&nbsp;&nbsp;causes OwnerRequest, ClinicClosure<br>&nbsp;&nbsp;precondition WithinCancellationWindow cause OwnerRequest: "..."`, meaning "A command can be issued for different reasons. A refusal that applies to one reason names it; the others are not refused for it.", rule 'A cause on a precondition or a placement must be one the command declares (V41).') and `note` (tag 'narration · outside the model', syntax `moment "Card is authorised"<br>&nbsp;&nbsp;note psp: "The network authorises the card"`, meaning "A step the model does not describe. It is not a node and asserts nothing; it can be the whole of a moment.", rule 'A moment holds a node, a when block or a note (V10).').
   Edit `triggers`/`moment` text: add to `moment`'s rule "Event, policy and command may share one moment when a policy declares the hop (V43)."

### `site/src/pages/docs.astro`

Add one line in the list of validation or grammar topics pointing to the new section. The proposed text: "Processes, causes, notes and hops: how to model process outcomes, cause-scoped refusals, steps outside the model, and a reactive column in one moment."

### `packages/core/CHANGELOG.md`

Not edited by hand. The change ships through a changeset (`.changeset/adr-040.md`, minor for `@mmmnt/core`, `@mmmnt/derive`, `@mmmnt/generate`, `@mmmnt/viz`, `@mmmnt/emit-ts`, `@mmmnt/harness`), written when the implementation lands.
