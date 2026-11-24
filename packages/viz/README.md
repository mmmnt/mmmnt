# @mmmnt/viz

Context map and flow timeline layout data from a Moment model.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/viz.svg)](https://www.npmjs.com/package/@mmmnt/viz)

## Overview

`@mmmnt/viz` turns the Intermediate Representation (IR) from `@mmmnt/core` into layout data: nodes, edges, lanes and coordinates. It draws nothing itself. A consumer renders the data with whatever it likes.

It produces two layouts:

- **A context map.** One node per bounded context, then one per external system, on a three-column grid. Edges come from declared relationships and from the `crosses-to` connections in flows.
- **A flow timeline.** One lane per bounded context of the model, and one entry per moment, with every flow laid out one after another on a shared horizontal axis. Connections mark each context crossing.

`VizEmitter` wraps both in a `VizDataEnvelope` with counts and timestamps, and wraps an envelope in a transmission event for a live session. A separate subpath, `@mmmnt/viz/server`, has a file watcher and a watch-mode publisher. The root export does not import it, because it needs Node-only APIs.

The renderers are pure functions of the IR. The same model gives the same layout.

The NDD event-storming board is a different package, [`@mmmnt/board`](../board/README.md).

## Installation

Requires Node.js 22 or newer.

```bash
npm install @mmmnt/viz
```

## Quick start

```typescript
import { readFileSync } from 'node:fs';
import { MomentParser } from '@mmmnt/core';
import { renderContextMap, renderTimeline } from '@mmmnt/viz';

const path = 'spec/ticketwave.moment';
const result = await new MomentParser().parseContent(readFileSync(path, 'utf-8'), path);
if (!result.success || !result.ir) throw new Error('The specification has errors');
const ir = result.ir;

const contextMap = renderContextMap(ir);
console.log(`Nodes: ${contextMap.nodes.length}, edges: ${contextMap.edges.length}`);
for (const node of contextMap.nodes) {
  const kind = node.isExternal ? 'External system' : 'Context';
  console.log(`  ${kind}: ${node.contextName} (${node.classification})`);
}

const timeline = renderTimeline(ir);
console.log(`Moments: ${timeline.entries.length} in ${timeline.lanes.length} lanes`);
```

For TicketWave this prints 7 nodes and 10 edges (the model declares no relationships, so every edge is a flow crossing), then 47 moments in 7 lanes.

## The context map

`renderContextMap(ir)` returns a `ContextMapLayout`: `nodes`, `edges` and `dimensions`.

- A context node has its classification (`Core`, `Supporting` or `Generic`; `Supporting` when none is declared) and `isExternal: false`.
- An external system node has the classification `External` and `isExternal: true`. A relationship between a context and an external system keeps its edge.
- A declared relationship gives an edge typed by its relationship pattern. A `crosses-to` connection gives an edge of type `crosses-to`, from the context that owns the event. One edge is kept per source, target and type.
- Each edge has two points, from the right side of the source node to the left side of the target.

```typescript
import { renderContextMap } from '@mmmnt/viz';

const contextMap = renderContextMap(ir);
for (const edge of contextMap.edges) {
  console.log(`${edge.sourceContextId} --> ${edge.targetContextId} [${edge.relationshipType}]`);
}
// ctx-Catalog --> ctx-Inventory [crosses-to]
// ctx-Inventory --> ctx-Checkout [crosses-to]
// ...
```

## The flow timeline

`renderTimeline(ir)` returns a `TimelineLayout`: `lanes`, `entries`, `connections` and `dimensions`.

- An entry sits in the lane of its moment's first node. A moment with only notes sits in the lane its first note speaks for, else in the lane of the moment before it.
- An entry carries the ADR-040 details of its moment, each only when present: `notes` (text and the lane spoken for), `hops` (same-moment `triggered-by` pairs, `from` and `to`) and `causes` (the cause a command is placed for).
- A connection is a `crosses-to` crossing, from the lane of the context that owns the event to the target context's lane, at the x of its source moment.

```typescript
import { renderTimeline } from '@mmmnt/viz';

const timeline = renderTimeline(ir);
const laneName = new Map(timeline.lanes.map((lane) => [lane.contextId, lane.contextName]));

timeline.entries.forEach((entry, i) => {
  const context = laneName.get(entry.contextId) ?? entry.contextId;
  console.log(`${String(i + 1).padStart(3)} | ${context.padEnd(13)} | ${entry.momentName}`);
});
//   1 | Catalog       | Event discovery
//   2 | Inventory     | Pool initialization
//   3 | Inventory     | Seat selection and hold
// ...
```

## The envelope

```typescript
import { writeFileSync } from 'node:fs';
import { VizEmitter } from '@mmmnt/viz';

const envelope = new VizEmitter().createEnvelope(ir, 'session-1', 1);
console.log(envelope.metadata);
// { contextCount: 7, flowCount: 8, relationshipCount: 0, generatedAt: '...' }

writeFileSync('viz-data.json', JSON.stringify(envelope, null, 2));
```

| `VizEmitter` method                                             | Returns                                                                                         |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `createEnvelope(ir, sessionId, version)`                        | `VizDataEnvelope`: `sessionId`, `timestamp`, `version`, `contextMap`, `timeline`, `metadata`    |
| `createInitialLoad(ir, session)`                                | `VizInitialLoad`: `{ type: 'viz:initial-load', session, envelope }`, envelope version 1         |
| `createIncrementalUpdate(ir, sessionId, version, changedFiles)` | `VizIncrementalUpdate`: `{ type: 'viz:incremental-update', sessionId, envelope, changedFiles }` |

`VizTransmissionEvent` also defines `viz:session-close`, with `closedAt` and a reason of `user-initiated`, `error` or `timeout`. The emitter does not create it.

### `moment viz`

```bash
moment viz spec/ticketwave.moment   # or a model directory, loaded as one project
```

Prints a `viz:initial-load` event as JSON to stdout. The session id is `viz-<timestamp>` and the specification name is the file or directory name without `.moment`. The command takes no options and opens no connection.

## Server (`@mmmnt/viz/server`)

| Export               | Description                                                                                                                                                                                                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FileWatcher`        | `new FileWatcher({ patterns, cwd, debounceMs, onChange, onError? })`. Watches `cwd` by polling, filters changes with the glob `patterns`, debounces them, and runs `onChange` one call at a time. `start()`, `stop()`, `isRunning()`.                                                                                                 |
| `WatchModePublisher` | `new WatchModePublisher({ watchPatterns, cwd, debounceMs, sessionId, target, buildTopology, onError? })`. On `start()` and on each matching change it calls `buildTopology()` and publishes a `TopologyUpdated` envelope to `target.publish()`. One publish runs at a time; a change during a publish is queued and rebuilt after it. |

Each published `ComplaiEventEnvelope` has `productSource: 'moment:topology'`, the session id, one correlation id for the publisher's lifetime, and the id of the previous envelope in `causationEventIds`. Its payload is the topology plus the `trigger` (`'initial'`, or the changed path relative to `cwd`). A failure during `start()` throws; a later failure goes to `onError`.

## API reference

### Functions and classes

| Export                 | Description                              |
| ---------------------- | ---------------------------------------- |
| `renderContextMap(ir)` | Returns a `ContextMapLayout`             |
| `renderTimeline(ir)`   | Returns a `TimelineLayout`               |
| `VizEmitter`           | Builds envelopes and transmission events |

### Types

| Type                                                                                | Description                                                                                                                                                                            |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ContextMapLayout`, `ContextMapNode`, `ContextMapEdge`                              | Nodes (`contextId`, `contextName`, `classification`, `isExternal`, position, size), edges (`sourceContextId`, `targetContextId`, `relationshipType`, `label`, `points`) and dimensions |
| `TimelineLayout`, `TimelineLane`, `TimelineEntry`, `TimelineConnection`             | Lanes (`contextId`, `contextName`, `y`, `height`), entries (`momentId`, `momentName`, `contextId`, position, size, and optional `notes`, `hops`, `causes`), crossings and dimensions   |
| `VizDataEnvelope`, `VizEnvelopeMetadata`                                            | The envelope, and its context, flow and relationship counts with `generatedAt`                                                                                                         |
| `VizTransmissionEvent`, `VizInitialLoad`, `VizIncrementalUpdate`, `VizSessionClose` | The transmission events                                                                                                                                                                |
| `VizSessionConfig`                                                                  | `sessionId`, `specificationName`, `startedAt`, and optional `endpoint` and `authToken`                                                                                                 |
| `SequenceLayout`, `SequenceParticipant`, `SequenceMessage`, `SequenceActivation`    | Sequence diagram types. No function in this package produces them, and the envelope does not carry one                                                                                 |
| `PreviewServerConfig`, `BundledApp`                                                 | Configuration types for a preview server and a bundled frontend. Nothing in this package uses them                                                                                     |

## Integration

`@mmmnt/viz` depends on `@mmmnt/core` for the IR.

| Consumer     | Uses                  |
| ------------ | --------------------- |
| `@mmmnt/cli` | `moment viz`          |
| `@mmmnt/mcp` | The `moment_viz` tool |

`@mmmnt/generate` draws static Mermaid diagrams of the same model in its specification document.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for what changed in each release.

## Contributing

This package is part of the [mmmnt monorepo](https://github.com/mmmnt/mmmnt). See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development setup.

```bash
pnpm install
pnpm turbo build --filter=@mmmnt/viz
pnpm --filter @mmmnt/viz test
```

## License

[FSL-1.1-Apache-2.0](../../LICENSE.md)
