# @mmmnt/board

Projects a parsed Moment project onto a numbered board that follows the Sift reference execution (ADR-047, ADR-048).

The input is the `IntermediateRepresentation` from `@mmmnt/core`, never the `.moment` text. The output is files only: `board.svg` (every frame at its place on the grid), one Canvas Composer SVG per frame, and `manifest.json`. Nothing is written to Miro.

```ts
import { loadSpecification } from '@mmmnt/core';
import { projectBoard, boardFiles } from '@mmmnt/board';

const { ir } = await loadSpecification('model/');
const files = boardFiles(projectBoard(ir, { contextOrder: ['Memory', 'Retrieval'] })); // file name to text
```

```bash
moment board model/ --out board/                     # board.svg, every frame, manifest.json
moment board model/ --out board/ --frame context-map
moment board model/ --out board/ --pointers pointers.json
```

## Numbers

A flow is numbered by an id token at the start of its name: `flow "N1 - First memory in minutes"` (the separator may be `-`, an en or em dash, `·` or `:`). The prefix letters are read from the model. A flow with no id, or two with one id, fails `moment board` with exit 1. A moment takes the token of its name (`N7.M3 · The report decides`), else `<flow id>.M<position>`. A context takes a token in its name, else its position in `manifest.yaml`, else the load order; the manifest records `numberSource`.

## Frames

`legend`, `grammar`, `context-map`, `context-C<i>` (caption), `aggregate-<Name>`, `services-C<i>`, `projection-query`, `policies`, `invariant-coverage` and `thread-<id>`. A frame with nothing to draw is omitted. A thread has moments as columns, rows for the contexts it touches, SYSTEM, BRANCH (refusals and arms) and a table of arms; an INTERACTION row only where a person note or an External entry exists.

Text is folded into the sticky (ADR-048 D3): `Name [Cause]` and `emits A, B | A when S` for a command, `[Process: Owner]` for a process event, `trigger E [f = v] -> Command` for a policy, `Precondition - Command` for a refusal. The Legend prints the exact hex of every named sticky colour.

## Manifest

`manifest.json` (`manifestVersion: 1`) lists `frames` (id, title, kind, number, numberSource, placement), `nodes` (`kind`, `name`, `context`, `role` of `definition` or `placement`, `flow`, `moment`, `momentId`, `frame`, `key`, and `cause`, `exit`, `terminal`, `optional`, `arm`, `armCondition`, `condition`, `of`, `marker`, `pointer` where they apply), `edges`, `momentIdSource` and `unrendered`. The diff against a board of record compares nodes by `(kind, name, context)`; positions are never compared.

## Closure

`sweepIr` walks the property paths of an IR instance. A path that is neither carried (`RENDERED`) nor unrendered with a reason (`UNRENDERED`) is reported. The tests run it over every model in `fixtures/valid`, TicketWave and the Sift model, and compare golden digests of the Sift and TicketWave renders.
