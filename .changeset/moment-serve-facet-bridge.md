---
'@mmmnt/cli': minor
---

**feat(cli): `moment serve` — WebSocket live bridge to Facet (ADR-031)**

Adds the `moment serve` command that runs the full pipeline (parse → derive →
topology + scenarios) and exposes it over a WebSocket on `ws://localhost:<port>`
for live consumption by Facet. Sends `WsInitialLoad` on connection, watches the
spec file for changes, and pushes `topology-update` / `scenario-update` /
`artifact-update` messages on every rebuild. Heartbeats and graceful shutdown
included.

```bash
moment serve <file.moment> [--port 4321] [--all]
```
