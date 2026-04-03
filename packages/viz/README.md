# @mmmnt/viz

Context map and flow timeline visualization from Moment domain specifications.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/viz.svg)](https://www.npmjs.com/package/@mmmnt/viz)

## Overview

`@mmmnt/viz` transforms the Intermediate Representation produced by `@mmmnt/core` into structured visualization data that can be rendered by any frontend or diagramming tool. It provides context maps showing the relationships between bounded contexts, and flow timelines showing the step-by-step progression of cross-context interactions.

Rather than producing static images, this package outputs a `VizDataEnvelope` -- a structured JSON format containing nodes, edges, layout coordinates, and metadata. This data-first approach allows consumers to render the visualizations using whatever technology they prefer: React components, D3.js, Mermaid, SVG templates, or terminal-based renderers. The envelope format is stable and documented, making it suitable for both interactive tooling and CI pipeline artifacts.

The package also provides a server subpath export (`@mmmnt/viz/server`) for scenarios requiring a live preview server with file watching and incremental updates. The root export remains platform-agnostic and can be used in any Node.js environment without server dependencies.

## Installation

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
import { MomentParser, astToIr } from '@mmmnt/core';
import { renderContextMap, renderTimeline } from '@mmmnt/viz';

const parser = new MomentParser();
const { ast } = parser.parse('path/to/spec.moment');
const ir = astToIr(ast);

// Render a context map
const contextMap = renderContextMap(ir);
console.log(`Nodes: ${contextMap.nodes.length}`);
console.log(`Edges: ${contextMap.edges.length}`);

for (const node of contextMap.nodes) {
  console.log(`  Context: ${node.label} (${node.aggregateCount} aggregates)`);
}

// Render a flow timeline
const timeline = renderTimeline(ir, { flowName: 'ScheduleAppointment' });
console.log(`Steps: ${timeline.entries.length}`);

for (const entry of timeline.entries) {
  console.log(`  ${entry.timestamp} | ${entry.context} -> ${entry.action}`);
}
```

## Key Features

- **Context map rendering** -- produces a graph of bounded contexts as nodes and their relationships (event flows, dependencies, shared kernels) as edges, with layout coordinates.
- **Flow timeline rendering** -- generates ordered timeline entries showing how commands and events flow across contexts step by step.
- **VizDataEnvelope format** -- a single structured JSON object containing all visualization data, suitable for serialization, storage, and transmission.
- **Sequence diagram support** -- the envelope includes participant, message, and activation data for rendering sequence diagrams of flows.
- **Incremental update events** -- the `VizTransmissionEvent` types support initial load, incremental update, and session close patterns for live preview scenarios.
- **Server subpath export** -- `@mmmnt/viz/server` provides a preview server with file watching and hot reload, kept separate to maintain a platform-agnostic root export.
- **Metadata-rich output** -- nodes and edges carry aggregate counts, event lists, and relationship types for rich rendering.
- **Technology-agnostic** -- the data format can drive React components, D3.js charts, Mermaid diagrams, SVG templates, or terminal renderers.

## API Reference

### Rendering Functions

| Export | Description |
|--------|-------------|
| `renderContextMap(ir)` | Produces a context map with nodes (bounded contexts) and edges (relationships, event flows) from the IR. Returns `ContextMapLayout`. |
| `renderTimeline(ir, options?)` | Produces a flow timeline with ordered entries showing context interactions. Accepts an optional flow name filter. Returns `TimelineLayout`. |

### Emitter

| Export | Description |
|--------|-------------|
| `VizEmitter` | Generates a complete `VizDataEnvelope` containing context maps and all flow timelines in a single pass. |

### Key Types

| Type | Description |
|------|-------------|
| `VizDataEnvelope` | Top-level container with context map data, timeline visualizations, and session metadata. |
| `VizEnvelopeMetadata` | Metadata about the envelope including source specification and generation timestamp. |
| `ContextMapLayout` | Layout data for a context map: nodes, edges, and bounding box dimensions. |
| `ContextMapNode` | A bounded context node with label, position coordinates, aggregate count, and metadata. |
| `ContextMapEdge` | A relationship edge with source, target, type (event flow, dependency, shared kernel), and associated events. |
| `TimelineLayout` | Layout data for a flow timeline: lanes, entries, and connections. |
| `TimelineLane` | A swim lane representing a bounded context in the timeline. |
| `TimelineEntry` | A single step in a timeline with timestamp, context, action, and payload summary. |
| `TimelineConnection` | A connection between timeline entries showing event flow direction. |
| `SequenceParticipant` | A participant in a sequence diagram (bounded context). |
| `SequenceMessage` | A message between participants in a sequence diagram. |
| `SequenceActivation` | An activation bar on a sequence diagram participant. |
| `SequenceLayout` | Complete layout for a sequence diagram with participants, messages, and activations. |
| `VizTransmissionEvent` | Union type for WebSocket-style events: initial load, incremental update, session close. |
| `VizInitialLoad` | Initial data payload for a live visualization session. |
| `VizIncrementalUpdate` | Delta update payload when specification files change during a session. |
| `VizSessionClose` | Session termination event. |
| `VizSessionConfig` | Configuration for a visualization session including watch paths and rendering options. |
| `PreviewServerConfig` | Configuration for the preview server (port, host, watch paths). |
| `BundledApp` | Bundled frontend application data for the preview server. |

## Examples

### Generating a Complete VizDataEnvelope

```typescript
import { MomentParser, astToIr } from '@mmmnt/core';
import { VizEmitter } from '@mmmnt/viz';
import { writeFileSync } from 'node:fs';

const parser = new MomentParser();
const { ast } = parser.parse('specs/vet-clinic.moment');
const ir = astToIr(ast);

const emitter = new VizEmitter();
const envelope = emitter.emit(ir);

console.log(`Context map: ${envelope.contextMap.nodes.length} nodes, ${envelope.contextMap.edges.length} edges`);
console.log(`Timelines: ${envelope.timelines.length}`);

// Serialize for consumption by a frontend
writeFileSync('viz-data.json', JSON.stringify(envelope, null, 2));
```

### Rendering Context Map Details

```typescript
import { MomentParser, astToIr } from '@mmmnt/core';
import { renderContextMap } from '@mmmnt/viz';

const parser = new MomentParser();
const { ast } = parser.parse('specs/vet-clinic.moment');
const ir = astToIr(ast);

const contextMap = renderContextMap(ir);

// Inspect bounded context nodes
for (const node of contextMap.nodes) {
  console.log(`Context: ${node.label}`);
  console.log(`  Position: (${node.x}, ${node.y})`);
  console.log(`  Aggregates: ${node.aggregateCount}`);
}

// Inspect relationships
for (const edge of contextMap.edges) {
  console.log(`${edge.source} --> ${edge.target} [${edge.type}]`);
  if (edge.events.length > 0) {
    console.log(`  Events: ${edge.events.join(', ')}`);
  }
}
```

### Flow Timeline for a Specific Flow

```typescript
import { MomentParser, astToIr } from '@mmmnt/core';
import { renderTimeline } from '@mmmnt/viz';

const parser = new MomentParser();
const { ast } = parser.parse('specs/vet-clinic.moment');
const ir = astToIr(ast);

// Render timeline for a specific flow
const timeline = renderTimeline(ir, { flowName: 'ScheduleAppointment' });

console.log('Flow: ScheduleAppointment');
console.log('Step | Context      | Action');
console.log('-----|--------------|-------');
for (let i = 0; i < timeline.entries.length; i++) {
  const entry = timeline.entries[i];
  console.log(`  ${i + 1}  | ${entry.context.padEnd(12)} | ${entry.action}`);
}
```

## Integration

`@mmmnt/viz` depends on `@mmmnt/core` for the IR. It connects to the broader ecosystem:

```
@mmmnt/core --> @mmmnt/viz
                    |
                    +-- @mmmnt/generate  (static Mermaid diagrams complement viz data)
                    +-- @mmmnt/cli       (exposed via `moment viz`)
                    +-- @mmmnt/mcp       (exposed via `moment_viz` tool)
```

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
