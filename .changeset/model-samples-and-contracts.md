---
'@mmmnt/cli': patch
'@mmmnt/core': patch
'@mmmnt/derive': patch
---

Derived sample payloads have the formats their types declare, a crossing contract names only fields its event declares, and the cli type-checks.

- derive: a `UUID` field samples a valid UUID, a version 8 (custom) UUID made from the SHA-256 of the field name. It was `<name>-001`, which a format check of UUIDs rejects. A field has the same UUID in every payload and on every run, so the same model still gives byte-identical scenarios. `DateTime`, `Date` and `Money` samples already had their formats and do not change.
- core: new rule V58. A crossing's `contract` field that the crossing event does not declare is a warning on a single file and an error over a project, like the other model-level rules. The diagnostic carries `ruleId: 'V58'`.
- Behaviour change: V58 can turn a project that loaded clean into one that fails. Declare the field on the event, or drop it from the contract.
- TicketWave's crossings of `PaymentInitiated` and `PaymentConfirmed` now name only fields their events declare.
- cli: `tsc --noEmit -p packages/cli` passes. The `derive` command read `result.notices`, which `runDerive` never returns; that line is gone and output is unchanged. The cli has a `typecheck` script, so CI's `pnpm turbo typecheck` checks it.
