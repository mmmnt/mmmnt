# Moment for Visual Studio Code

Syntax highlighting for **Moment** (`.moment`) specification files.

Moment is a DSL that translates Domain-Driven Design into temporal, event-storming
flows: bounded contexts, aggregates, commands, events, sagas, policies, and
flow lanes with branching, retries (`returns-to`), terminals, and cross-context
contracts (`crosses-to … via … contract`).

## Features

- Highlighting for Moment keywords, including flow constructs
  (`moment`, `lane`, `branch-lane`, `when`, `triggers`, `triggered-by`,
  `returns-to`, `crosses-to`, `via`, `contract`), orchestrations
  (`orchestration`, with `saga` as an alias, `states`, `on`, `compensation`,
  `timeout`), and the 0.6 building blocks (`projection`, `query`, `rule`,
  `term`, `external`, `state`, `gateway`)
- String, comment (`//` and `/* */`), and escape-sequence scopes
- Bracket matching, comment toggling, and auto-closing pairs

The TextMate grammar is generated from the language's Langium definition in
[`@mmmnt/core`](https://github.com/mmmnt/mmmnt) and copied into this
extension with the `sync-grammar` script, so highlighting follows the parser.

## Example

```moment
flow "N1 — A stranger books time with you"
  lane requestor "External Requestor"
  lane messaging "Messaging"
  lane refusals "Refusals"

  moment "M1 · A request arrives"
    requestor: SendRequest

  moment "Cold sender throttled" [branch]
    when SenderWarmOrActive [messaging]
      messaging: ThrottleExempt
    when ColdSenderThrottled [refusals]
      refusals: RejectInboundMessage
      refusals: ThrottleNoticeSent
        returns-to "M1 · A request arrives"
```

## Related tooling

- `moment` CLI (`@mmmnt/cli`, Node.js 22 or newer) — parse and validate
  `.moment` specs, derive test topologies, generate Gherkin features and
  TypeScript, simulate scenarios (with an AsyncAPI document), and detect and
  decide implementation drift (`moment sync`)
- **Facet** — `moment serve` bridges topology and scenarios to Facet over
  WebSocket
