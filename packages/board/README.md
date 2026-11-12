# @mmmnt/board

Projects a parsed Moment project onto an NDD board in the platform palette (ADR-047).

The input is the `IntermediateRepresentation` from `@mmmnt/core`, never the `.moment` text. The output is files only: one Canvas Composer SVG per frame and a `manifest.json`. Nothing is written to Miro.

```ts
import { loadSpecification } from '@mmmnt/core';
import { projectBoard, boardFiles } from '@mmmnt/board';

const { ir } = await loadSpecification('model/');
const files = boardFiles(projectBoard(ir)); // Map of file name to text
```

```bash
moment board model/ --out board/            # every frame and manifest.json
moment board model/ --out board/ --frame context-map
```

## Frames

| Frame                | One per | Draws                                                                                                                                                                                      |
| -------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `context-<Name>`     | context | aggregates (white outlined containers) with their commands, outcome groups and refusals, invariants, policies with their conditions, orchestrations, projections, queries, rules, services |
| `thread-<Flow>`      | flow    | moments as columns, one row per lane, a BRANCH row for arms, notes, cause chips, `OUTCOME` and `TERMINAL` exits, triggered-by hops                                                         |
| `context-map`        | model   | contexts and externals with their relationships                                                                                                                                            |
| `invariant-coverage` | model   | every invariant and rule with its scope or enforcer                                                                                                                                        |

Swatches are the platform's NDD palette (Moment `#9ea9ff`, Interface `#f5f6f8`, Action `#f5d128`, Refusal `#fff9b1`, Policy `#c6a2d2`, External `#ffcee0`, Command `#a6ccf5`, Event `#ff9d48`, Projection `#f0939d`, Query `#93d275`). The palette rules live in the platform workspace; this package carries the swatches as data.

## Manifest

`manifest.json` (`manifestVersion: 1`) lists `nodes` (`kind`, `name`, `context`, `role` of `definition` or `placement`, `flow`, `moment`, `frame`, `path`, and `cause`, `exit`, `terminal`, `optional`, `arm`, `condition`, `of`, `marker` where they apply), `edges`, the `frames`, and `unrendered`: the IR subtrees the board does not carry, each with its reason. The diff against a board of record compares nodes by `(kind, name, context)`; positions are never compared.

## Closure

`sweepIr` walks the property paths of an IR instance. A path that is neither carried (`RENDERED`) nor unrendered with a reason (`UNRENDERED`) is reported, so a property added to the IR later cannot be skipped silently. The tests run it over every model in `fixtures/valid` and TicketWave.
