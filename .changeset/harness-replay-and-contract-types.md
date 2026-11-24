---
'@mmmnt/cli': patch
'@mmmnt/harness': patch
---

The harness replays branch-lanes and checks contract values by their Moment type.

- harness: `EventReplayEngine` resolves a placement on a `branch-lane` (or a lane classified `[Terminal]`) to the lane, as `moment parse` does, and a placement on an `[External]` lane to the declared external. TicketWave replays all eight flows with no divergence; it reported five false ones in N1 to N4. A placement on a context the IR does not define, or on a lane of another flow, still diverges.
- harness: `ContractAssertionEngine` checks a value against its Moment type as `@mmmnt/schema` maps it (ADR-049). `UUID`, `DateTime` and `Date` are strings of that format, `Money` is a number, `T[]` is an array of `T` checked item by item, and a value object is an object. A valid UUID no longer fails as a type mismatch. Given the IR (`new ContractAssertionEngine(ir)`), a value object is checked as declared: its fields, a scalar value object with its pattern, a code set by its values, a tagged union by its `kind`, maps, exclusive groups and `[encrypted]` fields. New violations: `format mismatch`, `pattern mismatch`, `not in code set` and `exclusive fields`.
