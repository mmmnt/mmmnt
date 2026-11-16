---
'@mmmnt/cli': minor
---

Any Moment keyword may name a field, an input or a lane (ADR-051).

- core: a field (of an event, a value object, a variant, an exclusive group, an identity or a projection), a command, orchestration-command or query input, a lane, and every segment of a policy condition path may be named with any word the grammar reserves: `scope`, `policy`, `context`, `trigger`, `type`, `on`, `state`, `when`, `string`, ... A name is followed by `:` or `?:`, which no declaration that begins with the same word is, so the parser tells them apart. One rule, `ReservedWord`, replaces the word-by-word escapes of ADR-037, ADR-040, ADR-043, ADR-045 and ADR-049; a spec reads the grammar's keywords and fails if one is missing from it. A crossing's `contract` fields stay identifiers. No new token, IR key or rule.
- generate: the AsyncAPI document single-quotes a field name that YAML would read as a boolean or null (`on`, `yes`, `no`, `off`, `y`, `n`, `true`, `false`, `null`).

Not breaking: every model that parsed under 0.13.0 has the same IR, and `parse`, `test`, `derive`, `viz`, `cucumber-json`, `simulate --all`, `generate`, `emit-ts`, `board` and `schema emit` write the same files for TicketWave, every valid fixture and the Sift model copy.
