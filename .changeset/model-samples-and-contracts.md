---
'@mmmnt/derive': patch
---

Derived sample payloads have the formats their types declare.

- derive: a `UUID` field samples a valid UUID, a version 5 style UUID made from the SHA-1 of the field name. It was `<name>-001`, which a format check of UUIDs rejects. A field has the same UUID in every payload and on every run, so the same model still gives byte-identical scenarios. `DateTime`, `Date` and `Money` samples already had their formats and do not change.
