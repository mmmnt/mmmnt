---
'@mmmnt/cli': patch
'@mmmnt/generate': patch
---

The Gherkin `scenarioCount` is the number of scenarios a feature renders, and the AsyncAPI payloads are typed as `@mmmnt/schema` types an event payload.

- generate: `scenarioCount` counts the `Scenario:` blocks of `content`. It used to count one per moment and one per branch arm, so it missed the saga scenarios and counted a note-only moment that renders none. TicketWave N1 now reports 22 (was 20) and N3 10 (was 8).
- generate: an AsyncAPI payload schema comes from `emitPayloadSchemas` of `@mmmnt/schema` (ADR-049 D8), which `@mmmnt/generate` now depends on. `Money` is a number, `UUID`, `DateTime` and `Date` are strings with a format, a value object is a `$ref` into `components.schemas`, an array has `items`, and code sets, unions, maps, patterns, `[encrypted]`, optional and exclusive fields are written as in `moment schema emit`. Every other type used to be written `string`. The payload is closed (`additionalProperties: false`), so a contract `[required]` name the event does not declare is left out of `required`. A `$ref` with a pattern or a deprecation is wrapped in `allOf`, because AsyncAPI reads draft 07. Every string value is single-quoted. `examples/ticketwave/facet/asyncapi.yaml` is regenerated.
- generate: a generated feature carries only the keys `GeneratedFeatureFile` declares. The undeclared `name` key is gone; the flow is `flowId`.

`moment generate` and `moment cucumber-json` write the same files for TicketWave and every valid fixture. `moment simulate --out-dir` writes a different `asyncapi.yaml`.
