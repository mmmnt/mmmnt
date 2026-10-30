# @mmmnt/viz

Context map and flow timeline visualization from Moment domain specifications.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/viz.svg)](https://www.npmjs.com/package/@mmmnt/viz)

## Overview

`@mmmnt/viz` transforms the Intermediate Representation produced by `@mmmnt/core` into structured visualization data that can be rendered by any frontend or diagramming tool. It provides context maps showing the relationships between bounded contexts and the external systems they integrate with, and flow timelines showing the step-by-step progression of cross-context interactions.

Rather than producing static images, this package outputs a `VizDataEnvelope` -- a structured JSON format containing nodes, edges, layout coordinates, and metadata. This data-first approach allows consumers to render the visualizations using whatever technology they prefer: React components, D3.js, SVG templates, or terminal-based renderers. The envelope suits both interactive tooling and CI pipeline artifacts.

The package also provides a server subpath export (`@mmmnt/viz/server`) with a file watcher and a watch-mode publisher that rebuilds and publishes a topology when specification files change. The root export does not import the server modules, which depend on Node-only APIs.

## Installation

Requires Node.js 22 or newer.

```bash
npm install @mmmnt/viz
```

Or with other package managers:

```bash
pnpm add @mmmnt/viz
yarn add @mmmnt/viz
```

## Quick Start

```typescript
import { readFileSync } from 'node:fs';
import { MomentParser } from '@mmmnt/core';
import { renderContextMap, renderTimeline } from '@mmmnt/viz';

const path = 'path/to/spec.moment';
const result = await new MomentParser().parseContent(readFileSync(path, 'utf-8'), path);
if (!result.success || !result.ir) throw new Error('The specification has errors');
const ir = result.ir;

// Render a context map
const contextMap = renderContextMap(ir);
console.log(`Nodes: ${contextMap.nodes.length}`);
console.log(`Edges: ${contextMap.edges.length}`);

for (const node of contextMap.nodes) {
  const kind = node.isExternal ? 'External system' : 'Context';
  console.log(`  ${kind}: ${node.contextName} (${node.classification})`);
}

// Render the flow timeline
const timeline = renderTimeline(ir);
console.log(`Moments: ${timeline.entries.length}`);

for (const entry of timeline.entries) {
  console.log(`  ${entry.contextId} -> ${entry.momentName}`);
}
```

## Key Features

- **Context map rendering** -- produces a graph of bounded contexts and external systems as nodes, and their relationships as edges, with layout coordinates. Edges come from declared relationships (typed by relationship pattern) and from context crossings in flows.
- **External systems** -- every external system the model declares is drawn as a node with `isExternal: true` and the `External` classification, so a relationship between a context and an external keeps its edge.
- **Flow timeline rendering** -- lays out one lane per context and one entry per moment, with connections for each context crossing.
- **VizDataEnvelope format** -- a single structured JSON object containing the context map, the timeline, and metadata, suitable for serialization, storage, and transmission.
- **Transmission events** -- `VizEmitter` produces the `VizTransmissionEvent` messages for an initial load and incremental updates; the union also defines a session close.
- **Server subpath export** -- `@mmmnt/viz/server` provides `FileWatcher` and `WatchModePublisher`, kept separate from the root export.
- **Deterministic layout** -- the renderers are pure functions of the IR: the same specification produces the same layout.
- **Technology-agnostic** -- the data format can drive React components, D3.js charts, SVG templates, or terminal renderers.

## API Reference

### Rendering Functions

| Export | Description |
|--------|-------------|
| `renderContextMap(ir)` | Produces a context map with nodes (bounded contexts, then external systems) and edges (declared relationships and flow crossings) from the IR. Returns `ContextMapLayout`. |
| `renderTimeline(ir)` | Produces a timeline of every flow's moments, laid out in context lanes, with connections for context crossings. Returns `TimelineLayout`. |

### Emitter

| Export | Description |
|--------|-------------|
| `VizEmitter` | `createEnvelope(ir, sessionId, version)` builds a `VizDataEnvelope` containing the context map and timeline. `createInitialLoad(ir, session)` and `createIncrementalUpdate(ir, sessionId, version, changedFiles)` wrap an envelope in a transmission event. |

### Server (`@mmmnt/viz/server`)

| Export | Description |
|--------|-------------|
| `FileWatcher` | Watches files matching glob patterns under a directory, with debouncing, and calls `onChange` for each change. |
| `WatchModePublisher` | Watches the files matching its `watchPatterns`, rebuilds a topology on change through a `buildTopology` callback, and publishes it as an event envelope to a `TopologyPublishTarget`, one publish at a time. |

### Key Types

| Type | Description |
|------|-------------|
| `VizDataEnvelope` | Top-level container with session id, timestamp, version, context map, timeline, and metadata. |
| `VizEnvelopeMetadata` | Context, flow, and relationship counts and the generation timestamp. |
| `ContextMapLayout` | Layout data for a context map: nodes, edges, and dimensions. |
| `ContextMapNode` | A bounded context or external system with id, name, classification, `isExternal`, position, and size. |
| `ContextMapEdge` | A relationship edge with source and target ids, relationship type, label, and points. |
| `TimelineLayout` | Layout data for a flow timeline: lanes, entries, connections, and dimensions. |
| `TimelineLane` | A swim lane representing a bounded context in the timeline. |
| `TimelineEntry` | A single moment in the timeline with its context and position. |
| `TimelineConnection` | A context crossing between timeline lanes. |
| `SequenceParticipant` | Type for a participant in a sequence diagram (bounded context). |
| `SequenceMessage` | Type for a message between participants in a sequence diagram. |
| `SequenceActivation` | Type for an activation bar on a sequence diagram participant. |
| `SequenceLayout` | Type for a sequence diagram layout with participants, messages, and activations. The envelope does not carry a sequence layout. |
| `VizTransmissionEvent` | Union of `viz:initial-load`, `viz:incremental-update`, and `viz:session-close` events. |
| `VizInitialLoad` | Initial data payload for a live visualization session. |
| `VizIncrementalUpdate` | Updated envelope and the changed files when specification files change during a session. |
| `VizSessionClose` | Session termination event. |
| `VizSessionConfig` | Identity of a visualization session: session id, specification name, start time, and optional endpoint and auth token. |
| `PreviewServerConfig` | Type for preview server settings (port, watch paths, refresh interval, open browser). |
| `BundledApp` | Type describing a bundled frontend application (HTML path, assets directory, version). |

## Examples

The examples below start from a parsed IR, obtained as in the Quick Start:

```typescript
import { readFileSync } from 'node:fs';
import { MomentParser } from '@mmmnt/core';

const path = 'specs/ticketing.moment';
const result = await new MomentParser().parseContent(readFileSync(path, 'utf-8'), path);
if (!result.success || !result.ir) throw new Error('The specification has errors');
const ir = result.ir;
```

### Generating a Complete VizDataEnvelope

```typescript
import { VizEmitter } from '@mmmnt/viz';
import { writeFileSync } from 'node:fs';

const emitter = new VizEmitter();
const envelope = emitter.createEnvelope(ir, 'session-1', 1);

const { contextMap, timeline } = envelope;
console.log(`Context map: ${contextMap.nodes.length} nodes, ${contextMap.edges.length} edges`);
console.log(`Timeline: ${timeline.entries.length} moments in ${timeline.lanes.length} lanes`);

// Serialize for consumption by a frontend
writeFileSync('viz-data.json', JSON.stringify(envelope, null, 2));
```

### Rendering Context Map Details

```typescript
import { renderContextMap } from '@mmmnt/viz';

const contextMap = renderContextMap(ir);

// Inspect bounded context and external system nodes
for (const node of contextMap.nodes) {
  console.log(`${node.isExternal ? 'External' : 'Context'}: ${node.contextName}`);
  console.log(`  Position: (${node.x}, ${node.y})`);
  console.log(`  Classification: ${node.classification}`);
}

// Inspect relationships
for (const edge of contextMap.edges) {
  console.log(`${edge.sourceContextId} --> ${edge.targetContextId} [${edge.relationshipType}]`);
}
```

### Flow Timeline

```typescript
import { renderTimeline } from '@mmmnt/viz';

const timeline = renderTimeline(ir);
const laneName = new Map(timeline.lanes.map((lane) => [lane.contextId, lane.contextName]));

console.log('Step | Context      | Moment');
console.log('-----|--------------|-------');
timeline.entries.forEach((entry, i) => {
  const context = laneName.get(entry.contextId) ?? entry.contextId;
  console.log(`  ${i + 1}  | ${context.padEnd(12)} | ${entry.momentName}`);
});
```

## Integration

`@mmmnt/viz` depends on `@mmmnt/core` for the IR. It connects to the broader ecosystem:

```
@mmmnt/core --> @mmmnt/viz
                    |
                    +-- @mmmnt/cli       (exposed via `moment viz`)
                    +-- @mmmnt/mcp       (exposed via `moment_viz` tool)
```

`moment viz` prints the initial-load event for a single file or a model directory, which it loads as one project. `@mmmnt/generate` renders static Mermaid diagrams of the same model in its specification document.

## Contributing

This package is part of the [mmmnt monorepo](https://github.com/mmmnt/mmmnt). See the repository root for contribution guidelines, development setup, and the code of conduct.

```bash
git clone https://github.com/mmmnt/mmmnt.git
cd mmmnt
pnpm install
pnpm turbo build --filter=@mmmnt/viz
pnpm --filter @mmmnt/viz test
```

## License

[FSL-1.1-Apache-2.0](../../LICENSE.md)
