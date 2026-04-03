# @mmmnt/viz

Visualization engine for rendering context maps, flow timelines, and structured visualization data from Moment domain specifications.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/viz.svg)](https://www.npmjs.com/package/@mmmnt/viz)

## Overview

`@mmmnt/viz` transforms the Intermediate Representation produced by `@mmmnt/core` into structured visualization data that can be rendered by any frontend or diagramming tool. It provides context maps showing the relationships between bounded contexts, and flow timelines showing the step-by-step progression of cross-context interactions.

Rather than producing static images, this package outputs a `VizDataEnvelope` -- a structured JSON format containing nodes, edges, layout coordinates, and metadata. This data-first approach allows consumers to render the visualizations using whatever technology they prefer: React components, D3.js, Mermaid, SVG templates, or terminal-based renderers. The envelope format is stable and documented, making it suitable for both interactive tooling and CI pipeline artifacts.

The package also provides convenience functions for rendering timelines and context maps directly, which produce self-contained visualization data ready for consumption without requiring manual assembly of the envelope structure.

## Installation

```bash
npm install @mmmnt/viz
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

### VizEmitter

```typescript
import { VizEmitter } from '@mmmnt/viz';

// Generate a complete VizDataEnvelope
const emitter = new VizEmitter();
const envelope = emitter.emit(ir);

// The envelope contains all visualization data in a single structure
console.log(`Context map: ${envelope.contextMap.nodes.length} nodes`);
console.log(`Timelines: ${envelope.timelines.length}`);

// Serialize for storage or transmission
const json = JSON.stringify(envelope, null, 2);
```

## API Reference

### Rendering Functions

| Export | Description |
|--------|-------------|
| `renderContextMap(ir)` | Produces a context map with nodes (bounded contexts) and edges (relationships, event flows) from the IR. |
| `renderTimeline(ir, options?)` | Produces a flow timeline with ordered entries showing context interactions. Accepts an optional flow name filter. |

### Emitter

| Export | Description |
|--------|-------------|
| `VizEmitter` | Generates a complete `VizDataEnvelope` containing context maps and all flow timelines in a single pass. |

### Key Types

| Type | Description |
|------|-------------|
| `VizDataEnvelope` | Top-level container with context map data and an array of timeline visualizations. |
| `ContextMapData` | Nodes and edges representing bounded contexts and their relationships. |
| `ContextMapNode` | A bounded context node with label, position, aggregate count, and metadata. |
| `ContextMapEdge` | A relationship edge with source, target, type, and associated events. |
| `TimelineData` | Ordered entries representing the progression of a flow across contexts. |
| `TimelineEntry` | A single step in a timeline with timestamp, context, action, and payload summary. |

## Integration

`@mmmnt/viz` depends on `@mmmnt/core` for the IR. It connects to the broader ecosystem:

- **@mmmnt/generate** produces static Mermaid diagrams in specification documents, while `@mmmnt/viz` provides the structured data for interactive visualizations.
- **@mmmnt/mcp** exposes visualization data through the `moment_viz` tool for AI agent integration.
- **@mmmnt/cli** exposes visualization via the `moment viz` command, which outputs the VizDataEnvelope as JSON.

## License

[FSL-1.1-Apache-2.0](../../LICENSE.md)
