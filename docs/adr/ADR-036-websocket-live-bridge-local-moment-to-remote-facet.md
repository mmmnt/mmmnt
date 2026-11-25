# ADR-036: WebSocket Live Bridge — Local Moment to Remote Facet

Migrated from Confluence page 49741825 (version 3, last updated 2026-04-21), https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/49741825. The Confluence space is private; this file is now the record.

Page renumbered from ADR-031 to ADR-036 (2026-04-20) due to numbering collision with ADR-031: facet.json Output Contract. Original content preserved below.

Note: This ADR was originally published as ADR-031 on 2026-04-06. It was renumbered to ADR-036 on 2026-04-20 because ADR-031 was already assigned to the facet.json Output Contract (page 48791554, 2026-04-04). All cross-references should reference ADR-036.

(Original page content follows — unchanged except for the number in the title.)

[RECOVERED FROM PAGE HISTORY v2 — live page body was lost in the 2026-04-20 renumbering edit]

ADR-036 (orig ADR-031): WebSocket Live Bridge — Local Moment to Remote Facet (2026-04-06 v1.1, Proposed).

`moment serve <file.moment> [--port 4321] [--all]`: parse → derive → topology + scenarios → WebSocket on ws://localhost:4321 (localhost-only, no auth) → WsInitialLoad (manifest, topologies, scenarios keyed by out-dir filenames, artifacts: eventCatalog/impactAnalysis/sagaStateMachines) → watch file → push WsTopologyUpdate (full topology, no diffs, <50KB) / WsScenarioUpdate (per flow) / WsArtifactUpdate / WsError (phase parse|derive|topology|simulate; client keeps last valid topology rendered).

Lifecycle: server ping 30s / pong timeout 10s / terminate dead clients / max 10 clients; SIGINT → close 1000 "Moment server shutting down" (client shows stopped, no reconnect); restart → close 1001; pipeline crash → WsError, server stays alive; client reconnect exponential backoff 1s..16s then 30s; fresh WsInitialLoad on reconnect (no state sync); stale detection >45s.

asyncapi.yaml excluded from stream (duplicate-key YAML issues). Transports: WebSocket = local dev real-time; S3 (MMNT-4481) = team/CI; manual upload = demo — same artifact format.

Rejected: SSE (unidirectional), HTTP polling, Facet-side fs watching (browser app), overloading `moment watch` (serve implies watch).
