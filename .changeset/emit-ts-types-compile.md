---
'@mmmnt/cli': minor
'@mmmnt/emit-ts': minor
---

The TypeScript that `emit-ts` writes type-checks on its own under `tsc --strict`.

- emit-ts: `DateTime` is written as `string` and `Money` as `number`, the type of the value an event records, as `UUID` already was and as `moment schema emit` writes them. No emitted file named `DateTime` or `Money` without declaring it.
- emit-ts: `Date` is written as `string`, an ISO 8601 date (`2026-11-24`), as `moment schema emit` records it and as derive samples it. It was the JavaScript `Date` object type, which no JSON payload carries.
- emit-ts: a types, aggregate, read-model or process file imports each declared type it names from the file that declares it, with `import type` and a relative path: another aggregate's file, the context's `read-model.types.ts`, or a file of another context. The context's own files come first.
- emit-ts: when two files of a context, or two contexts, declare the same name, the barrel re-exports it from the first, so `export *` no longer drops it. At `aggregate` scope the context barrel no longer re-exports a `read-model.types.ts` it does not emit.

Breaking for code that passes a JavaScript `Date` into a generated `Date` field: pass the ISO date string instead (`d.toISOString().slice(0, 10)`). Otherwise not breaking for code that compiled before: a field that was `DateTime` or `Money` is now `string` or `number`, which is what the name stood for, and every other change adds an import or an export. TicketWave and every model in `fixtures/valid` compile with no diagnostics, and a spec checks it.
