# ADR-007: Visualization Hosting — Local Preview Server

Migrated from Confluence page 11960348 (version 2, last updated 2026-03-28), https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/11960348. The Confluence space is private; this file is now the record.

- **Status:** Accepted (§2 partially superseded — see notice below)
- **Date:** March 9, 2026
- **Deciders:** listenrightmeow, Claude (DDD Coaching Project)
- **Tags:** @mmmnt/viz, cli, developer-experience
- **Gap Report Ref:** SG-04 (Pass 1)

⚠️ Partial Supersession Notice (2026-03-28)

ADR-007 §2 (local preview server serving bundled React app) is partially superseded by [ADR-023](ADR-023-simulation-output-contracts-topology-emission-and-trace-format.md): Simulation Output Contracts (page 41877521).

Moment is a CLI product, not a rendering product. Visualization rendering is now owned by Facet (separate product). [ADR-023](ADR-023-simulation-output-contracts-topology-emission-and-trace-format.md) established the Moment → Facet event contract via Wundergraph federated router (PADR-003).

What remains valid: File-watching logic, re-parse on change, configurable debounce, graceful shutdown.

What is superseded: Local HTTP server, pre-bundled React app, browser auto-open, SSE/WebSocket live refresh, static asset serving. These are now Facet's responsibility.

Replacement: MMNT-116 re-scoped to Watch-Mode Event Publisher — file watcher → re-parse → re-derive topology → push ComplaiEventEnvelope to Wundergraph router (PADR-004). Facet's Event Ingestion context consumes and renders.

## Context

The Visualization context (@mmmnt/viz) produces layout data structures (TimelineLayout, SequenceLayout) from the MomentData IR. Something must render these into a visual experience for the developer.

Two audiences consume visualization differently:

- Complai Sift users: Visualization renders inside Sift's client-app:spec-view — a full React application with routing, state management, and real-time pipeline integration. This path is handled by the Complai commercial product.

- Open-source users: No Sift client app. The @mmmnt/viz package and moment CLI are the only interface. These users need to see their moment specifications visually without any Complai infrastructure.

The open-source visualization must handle:

- Rendering both timeline (swim lane) and sequence (phased cards) views

- Navigation between multiple moment specs in a project

- Toggle between views for the same spec

- Click-to-expand detail panels with full manifest metadata

- Error boundaries when parsing or rendering fails

- Future extensibility: routing, filtering, search, diff views

A static HTML file with inline JavaScript is insufficient for this scope. React component rendering in a single file works for trivial cases but breaks down with routing, error handling, state management, and the interactive features the visualization requires (toggleable branch lanes, expandable detail panels, context filtering).

## Decision

### moment viz launches a local preview server

The moment viz CLI command starts a lightweight local development server that:

- Serves a bundled React application from @mmmnt/viz — the same component library, packaged as a standalone app for local preview

- Opens the default browser automatically to http://localhost:\<port>

- Watches .moment and .manifest.yaml files for changes and triggers re-parse + re-render (hot reload of data, not full HMR)

- Serves on an available port with fallback — default 4200, auto-increment if occupied

- Shuts down cleanly on Ctrl+C or when the terminal session ends

### Server architecture

The preview server is minimal — its only job is to serve the pre-bundled React app and provide parsed MomentData IR as JSON via a local API endpoint.

Components:

- HTTP server: Lightweight Node.js server (no Express dependency — native http module or a minimal framework like sirv or polka). Serves the pre-bundled React app as static assets.

- Data endpoint: GET /api/moments returns parsed MomentData IR for all .moment files in the project. GET /api/moments/:name returns a single spec. GET /api/manifest returns the loaded manifest.

- File watcher: Watches .moment and .manifest.yaml files. On change, re-parses and pushes updated IR to the client via Server-Sent Events (SSE) or WebSocket for live refresh.

- Error reporting: Parse errors and validation failures render in the browser UI as actionable error panels (source location, rule violated, suggested fix) rather than crashing the server.

### React application

The bundled React app provides:

- Spec navigator: Sidebar listing all .moment files in the project. Click to load.

- Dual view toggle: Switch between timeline and sequence views for the active spec.

- Interactive features: Toggleable branch lanes, click-to-expand detail panels, manifest metadata on hover, ADR reference links.

- Error boundary: Parse/validation errors render inline with source location and rule context — not a white screen.

- Responsive layout: Usable on varying screen sizes, though primarily a desktop tool.

### Build strategy

The React app is pre-bundled at package publish time — not built on the developer's machine at moment viz runtime. The @mmmnt/viz npm package includes a dist/ directory with the production-built React app. The preview server serves these static files directly. This means:

- No build step at runtime — moment viz starts in under 2 seconds

- No React/Vite/webpack dependency on the developer's machine

- The bundled app is a production build — optimized, minified, tree-shaken

### CLI interface

```
moment viz [options]

Options:
  --port <number>     Port for preview server (default: 4200)
  --no-open           Don't open browser automatically
  --manifest <path>   Path to .manifest.yaml (default: ./.manifest.yaml)
  --watch             Watch for file changes and live refresh (default: true)
  --no-watch          Disable file watching
```

Default behavior: moment viz in a project directory starts the server, parses all .moment files using the manifest, and opens the browser. The developer sees their specs immediately.

### VS Code extension (V1.1)

The Langium LSP (ADR parser technology decision) provides syntax highlighting, autocomplete, and inline validation for .moment files in VS Code. A natural V1.1 companion is a VS Code extension that renders the visualization inline — a webview panel showing the timeline/sequence views alongside the editor.

The V1.1 extension would embed the same React components from @mmmnt/viz, served in a VS Code webview. The preview server and the VS Code extension share the component library — different hosting surfaces, same renderers.

## Consequences

What becomes easier:

- Immediate visual feedback — moment viz is a single command from zero to rendered visualization

- File watching provides a tight authoring loop — edit .moment file, see changes in browser immediately

- Error reporting in the browser UI means the architect never has to context-switch to the terminal to understand a parse failure

- Pre-bundled app means no build toolchain friction — works on any machine with Node.js

- The component library is reusable across hosting surfaces (CLI preview, VS Code extension, Complai client app)

What becomes harder:

- The pre-bundled React app adds to @mmmnt/viz package size — mitigated by production build optimization

- The local server introduces a runtime process the developer must manage (start/stop) — mitigated by clean shutdown behavior and --no-watch for one-shot rendering

- SSE/WebSocket for live refresh adds modest complexity to the server — but the alternative (manual browser refresh) is a worse developer experience

What becomes possible:

- Future diff views (compare two versions of a moment spec) are a routing addition, not an architecture change

- Future Miro/Figma plugin adapters consume the same @mmmnt/viz component library, packaged for their respective plugin hosting

- Multi-spec dashboard views (all specs at a glance) are a page addition to the React app

## Alternatives Considered

1. Self-contained HTML file output (rejected): moment viz generates a single .html file with inline JS and opens it in the browser. Rejected because: no routing between multiple specs, no live refresh on file changes, no error boundaries, React components in a single inline script become unmaintainable as features grow. The static file approach works for trivial cases but not for the interactive visualization this product requires.

2. Electron app (rejected): Ship a standalone desktop application for visualization. Rejected because: massive distribution overhead (Electron bundles Chromium), unnecessary for a tool that's already running in a terminal alongside an editor. A local server + browser is lighter and more composable.

3. Terminal-based rendering (rejected): Render ASCII diagrams in the terminal. Rejected because: the swim lane timeline view requires spatial layout that terminal rendering cannot express with sufficient fidelity. The terminal is the right interface for moment parse and moment validate output — not for interactive visualization.

4. IR-only output, rendering delegated to community (rejected): @mmmnt/viz exports layout data structures only, with no built-in rendering. Rejected because: the open-source user sees nothing visual in V1. The rendering experience is a core value proposition — "see your domain's temporal flows" — not an optional add-on. Community renderers (Miro, Figma) complement the built-in preview; they don't replace it.

5. VS Code extension as V1 (deferred to V1.1): Ship the visualization inside VS Code from day one. Deferred because: the Langium LSP is the V1 priority for VS Code integration. The preview server works for all editors, not just VS Code. The V1.1 extension reuses the same component library, so the investment in the preview server is not throwaway work.
