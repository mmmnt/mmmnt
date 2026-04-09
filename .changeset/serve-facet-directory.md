---
'@mmmnt/cli': minor
---

**feat(cli): `moment serve` accepts a facet directory**

`moment serve` now accepts either a `.moment` spec file (live-derive, as
before) or a directory of pre-built artifacts written by
`moment simulate --out-dir <dir> --all` (new). This decouples scenario
bake from the live bridge, so a single baked directory can drive Facet
over the same WebSocket protocol without re-parsing the spec on every
connect.

```bash
# Bake once
moment simulate .moment/flows/order-placed.moment --all --out-dir .facet

# Serve many times, with or without negative scenarios
moment serve .facet          # happy-path scenarios only
moment serve .facet --all    # every scenario (happy + negatives)
```

**Directory mode is manifest-driven.** `serve` reads
`<dir>/manifest.json` as the authoritative index of flows → topology +
scenarios + artifacts. No filename globbing, no guessing. Fails fast
with an actionable error if the manifest is missing or malformed:

```
Initial pipeline failed: Facet directory is missing manifest.json at
/path/to/.facet/manifest.json. Run `moment simulate <spec.moment>
--out-dir /path/to/.facet --all` to populate it.
```

**`--all` has different semantics in directory mode.** At bake time
(`simulate --all`) it means "write every branch combination + every
negative scenario to disk". At serve time over a pre-built directory,
it's a filter against the manifest's `isHappyPath`/`isNegative` flags —
default serves happy-path only, `--all` serves everything. One baked
directory can power both a clean demo and a "show the failure modes"
view without rebaking.

The WebSocket payload shape is identical between live-derive and
directory modes — Facet sees the same `WsInitialLoad` / `WsTopologyUpdate`
/ `WsScenarioUpdate` / `WsArtifactUpdate` messages regardless of source.
Directory mode's watcher re-reads on any `.json` change (debounced
300ms) so re-running `simulate --out-dir` live-updates connected
clients.
