# @mmmnt/board

Projects a parsed Moment project onto a numbered board that follows the Sift reference execution (ADR-047, ADR-048).

The input is the `IntermediateRepresentation` from `@mmmnt/core`, never the `.moment` text. The output is files only: `board.svg` (every frame at its place on the grid), one Canvas Composer SVG per frame, and `manifest.json`. `moment board` writes these files and nothing else. It does not connect to Miro, and nothing is written to a Miro board. Uploading the SVGs to a board is a separate step.

**Example.** [The TicketWave board in Miro](https://miro.com/app/board/uXjVEKasFkQ=/) is projected from [`examples/ticketwave/spec/`](../../examples/ticketwave/spec/). To produce its files:

```bash
moment board examples/ticketwave/spec/ --out board/
# Board written to .../board: 39 file(s) and manifest.json (38 frame(s), 509 node(s))
```

## Installation

Requires Node.js 22 or newer.

```bash
npm install @mmmnt/board
```

## Usage

```ts
import { loadSpecification } from '@mmmnt/core';
import { projectBoard, boardFiles } from '@mmmnt/board';

const { ir } = await loadSpecification('examples/ticketwave/spec/');
if (!ir) throw new Error('The specification has errors');
const files = boardFiles(projectBoard(ir, { contextOrder: ['Catalog', 'Inventory'] })); // file name to text
```

```bash
moment board <path> --out <dir> [--frame <id>] [--pointers <file>]

moment board model/ --out board/                     # board.svg, every frame, manifest.json
moment board model/ --out board/ --frame context-map # context-map.svg and manifest.json
moment board model/ --out board/ --pointers pointers.json
```

- `<path>` is a `.moment` file or a model directory. A directory with a `manifest.yaml` takes its context order from it.
- `--frame <id>` writes one frame and the manifest. An unknown id fails and lists the frame ids.
- `--pointers <file>` reads `{ "pointers": [{ "kind", "name", "context"?, "momentId"?, "pointer" }] }` and adds each `pointer` to the manifest nodes it names. A pointer that names no node fails with exit 1.
- A model that does not parse writes nothing and exits 1.

## Numbers

A flow is numbered by an id token at the start of its name: `flow "N1 - General admission purchase"` (the separator may be `-`, an en or em dash, `·` or `:`). The prefix letters are read from the model. A flow with no id, or two with one id, fails `moment board` with exit 1. A moment takes the token of its name (`N7.M3 · The report decides`), else `<flow id>.M<position>`. A context takes a token in its name, else its position in `manifest.yaml`, else the load order; the manifest records `numberSource`.

## Frames

`legend`, `grammar`, `context-map`, `context-C<i>` (caption), `aggregate-<Name>`, `services-C<i>`, `projection-query`, `policies`, `invariant-coverage` and `thread-<id>`. A frame with nothing to draw is omitted: TicketWave has no `projection-query` frame, and `services-` frames only for C2 and C5. Each frame is written as `<frame id>.svg`. A thread has moments as columns, rows for the contexts it touches, SYSTEM, BRANCH (refusals and arms) and a table of arms; an INTERACTION row only where a person note or an External entry exists.

Text is folded into the sticky (ADR-048 D3): `Name [Cause]` and `emits A, B | A when S` for a command, `[Process: Owner]` for a process event, `trigger E [f = v] -> Command` for a policy, `Precondition - Command` for a refusal. The Legend prints the exact hex of every named sticky colour.

## Manifest

`manifest.json` (`manifestVersion: 1`) has:

- `specification`
- `frames`: id, title, kind, number, numberSource and placement
- `nodes`: `kind`, `name`, `context`, `role` (`definition` or `placement`), `frame`, `key` and `path` (where in the IR the node comes from), plus `flow`, `moment`, `momentId`, `cause`, `exit`, `terminal`, `optional`, `arm`, `armCondition`, `condition`, `of`, `marker`, `pointer` and `derived` where they apply. `derived: true` marks a placement the renderer makes and the flow does not write, such as a refusal placed from a precondition.
- `edges`
- `unrendered`: the IR paths the board does not draw, each with its reason
- `momentIdSource`: the moment ids that came from the position, not the moment name

The diff against a board of record compares nodes by `(kind, name, context)`; positions are never compared.

## API

| Export                                                                                     | Description                                                                                                                                                |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projectBoard(ir, options?)`                                                               | Returns a `BoardProjection`: `frames`, `manifest` and `notices`. Options: `contextOrder`, `pointers`. Throws `BoardNumberingError` or `BoardPointerError`. |
| `boardFiles(projection, only?)`                                                            | The files as a map of name to text: `board.svg`, one SVG per frame and `manifest.json`. With `only`, that frame and the manifest.                          |
| `renderFrameSvg(frame, at?)`, `renderBoardSvg(frames, places)`                             | One frame, or every frame at its place, as SVG text                                                                                                        |
| `placeFrames(frames)`, `extent(placements)`, `boardExtent(projection)`                     | Grid placement of the frames and the board's size                                                                                                          |
| `frameFileName(frameId)`                                                                   | The file name of a frame                                                                                                                                   |
| `numberFlow`, `numberFlows`, `numberContexts`, `armIds`                                    | The numbering rules                                                                                                                                        |
| `sweepIr(ir)`, `irPaths(ir)`, `RENDERED`, `UNRENDERED`                                     | The closure sweep                                                                                                                                          |
| `USES`                                                                                     | The text each construct folds into its sticky                                                                                                              |
| `SWATCH`, `OPTIONAL_SWATCH`, `KIND_SWATCH`, `STICKY_COLOR`, `fillOf`, `nearestStickyColor` | The palette                                                                                                                                                |

## Closure

`sweepIr` walks the property paths of an IR instance. A path that is neither carried (`RENDERED`) nor unrendered with a reason (`UNRENDERED`) is reported in `uncovered`. The tests run it over every model in `fixtures/valid`, TicketWave and the Sift model, and compare golden digests of the Sift and TicketWave renders.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for what changed in each release.

## License

[FSL-1.1-Apache-2.0](../../LICENSE.md)
