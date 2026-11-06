# Palette delta 041

Companion to [ADR-041](adr/ADR-041-commands-record-one-or-more-events.md). Status: Accepted (founder, 2026-11-05). Applied with the implementation.

The delta adds no swatch. It brings Moment to the palette's own wording of a command: "targets exactly one aggregate root, produces event(s) or a rejection", and "one command → one aggregate → one transaction". Moment said one event. It now says one or more. Swatches are those of the platform NDD palette (ruling 324322a8): Command `#a6ccf5`, Event `#ff9d48`, Business rule/refusal `#fff9b1`, Process/policy `#c6a2d2`.

## 1. What changes on the platform NDD palette (for the platform corpus)

| Palette entry | Before | After |
|---|---|---|
| Command `#a6ccf5` | A command produces an event. | A command produces one or more events, or a refusal. It is drawn once. |
| Event `#ff9d48` | One event sticky follows a command sticky. | Events recorded together are several event stickies in one moment, side by side, each joined to the command by its own short causal arrow. They are siblings of one transaction: no arrow runs between them. |
| Alternative outcomes | Not expressible. | The command sticky is drawn once. The events of each outcome are grouped, one group per alternative, and the group carries the state that chooses it as a chip, for example `[Open]`, in the same way a cause chip is drawn. Exactly one group happens. |
| Business rule/refusal `#fff9b1` | Unchanged. | A refusal rejects the command whatever its outcomes: no event of any group is recorded. |
| Process/policy `#c6a2d2` | A policy reacts to an event in a later transaction. | Unchanged. A fact the aggregate records in the same transaction is another event of the command. A policy remains the answer for a reaction in another aggregate, such as a payment that confirms and a hold that converts. |

Wording for the platform palette text (platform corpus; not applied here): "A command produces one or more events, or a refusal with no event. Events a command produces together are siblings of one transaction. A command may have alternative outcomes; the aggregate's state chooses exactly one."

## 2. Moment's own docs and site pages

Edits are applied.

- `packages/core/README.md`: the construct table gains the emits clause; a section, "Commands that record several events", states the two operators and the guard; the validation table gains V44 to V48 and rewords V31 and V38; the API table gains `EmitOutcomeDefinition`, `emittedEvents` and `emitOutcomes`.
- `README.md` (repository root): one bullet in "What's in 0.6".
- `site/src/pages/dsl.astro`: the `command · emits` row, and the `emits` entry of the teaching record (its syntax, meaning and rule).
- `site/src/pages/docs.astro`: a "Going deeper" card, "Commands that record several events".

The package changelogs are not edited by hand. The change ships through `.changeset/adr-041-commands-record-one-or-more-events.md`, a minor release of the fixed `@mmmnt/*` group.
