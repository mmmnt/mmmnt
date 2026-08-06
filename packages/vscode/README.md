# Moment for Visual Studio Code

Syntax highlighting for **Moment** (`.moment`) specification files.

Moment is a DSL that translates Domain-Driven Design into temporal, event-storming
flows: bounded contexts, aggregates, commands, events, sagas, policies, and
flow lanes with branching, retries (`returns-to`), terminals, and cross-context
contracts (`crosses-to … via … contract`).

## Features

- Highlighting for all Moment keywords, including flow constructs
  (`moment`, `lane`, `branch-lane`, `when`, `triggers`, `triggered-by`,
  `returns-to`, `crosses-to`, `via`, `contract`) and saga transition event
  mappings (`states Held -> Converting on PaymentConfirmed`)
- String, comment (`//` and `/* */`), and escape-sequence scopes
- Bracket matching, comment toggling, and auto-closing pairs

The grammar is generated from the language's Langium definition in
[`@mmmnt/core`](https://github.com/mmmnt/mmmnt), so highlighting stays in
lockstep with the parser.

## Example

```moment
flow "N1 — A stranger books time with you"
  lane requestor "External Requestor"
  lane messaging "Messaging"

  moment "Cold sender throttled" [branch]
    when SenderWarmOrActive [messaging]
      messaging: ThrottleExempt
    when ColdSenderThrottled [refusals]
      refusals: RejectInboundMessage
      refusals: ThrottleNoticeSent
        returns-to "M1 · A request arrives"
```

## Related tooling

- `moment` CLI — parse, validate, and generate simulation scenarios,
  topologies, Gherkin features, and AsyncAPI documents from `.moment` specs
- **Facet** — the replay/assertion harness that proves generated designs
  against their declared flows
