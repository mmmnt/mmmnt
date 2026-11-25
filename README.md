<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="site/public/logo/moment-logo-light.png" />
    <img src="site/public/logo/moment-logo-dark.png" alt="moment." height="72" />
  </picture>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@mmmnt/core"><img src="https://img.shields.io/npm/v/@mmmnt/core.svg?label=npm" alt="npm" /></a>
  <a href="https://discord.gg/YcRqsQUQuu"><img src="https://img.shields.io/discord/1489758529219723486?color=5865F2&logo=discord&logoColor=white&label=Discord" alt="Discord" /></a>
  <a href="LICENSE.md"><img src="https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg" alt="License: FSL-1.1-Apache-2.0" /></a>
</p>

# Moment

**Rehearse an event-driven domain before you build it.**

Moment is a specification language and toolchain for domain-driven design that treats time as part of the model. You describe your bounded contexts, and the flows that carry events between them, in plain-text `.moment` files. Moment checks the model, then derives from it the tests, types, simulations, schemas, documents and boards your team would otherwise write by hand. It derives them again, unchanged, every time the model changes.

**See it first.** [TicketWave](examples/ticketwave/spec/ticketwave.moment), an example ticketing platform, is modelled in Moment, [projected as an event-storming board](https://miro.com/app/board/uXjVEKasFkQ=/), and [rehearsed in Facet](https://facet.mmmnt.dev) before a line of its code exists. [Walk through it below.](#from-design-to-running-code-moment-facet-and-feature)

## Why Moment

Event-driven systems rarely fail inside one aggregate. They fail at the boundaries:

- an event crosses into another context without a field that context needs
- a policy reacts to the wrong occurrence
- a branch nobody wrote a test for takes the system somewhere unexpected

Domain-driven design gives you the vocabulary for those boundaries. Its usual output, though, is a whiteboard, a Miro board or a wiki page. That is a static, two-dimensional map, and it goes straight into production code with no rehearsal in between.

Moment adds the missing step:

- **The model is code.** Contexts, aggregates, commands, events, policies, orchestrations, projections and queries are typed declarations in a file you review like any other change. They are not sticky notes.
- **Time is part of the model.** A `flow` says what happens in which order, which event crosses to which context, and under which **contract**: the fields the receiving side requires.
- **Every path is derived.** Each branch arm, each crossing and each unmet precondition becomes a test scenario. Nobody has to remember to write it.
- **Nothing rots.** Types, Gherkin features, test scaffolds, JSON Schemas and specification documents are regenerated from the model. Drift between the model and an implementation is detected and recorded as a decision.

Moment is for domain architects who want a design they can test, for teams who want contracts settled before implementation, and for anyone tired of documentation that describes last quarter's system.

## From design to running code: Moment, Facet and Feature

Moment is the first of three tools that take a domain from a design to verified code. Each one answers a single question, and each hands the next something it can check.

|                                         | The question it answers                          | What you write                                        | What you get                                                                       |
| --------------------------------------- | ------------------------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Moment**                              | Is the design complete and consistent over time? | A `.moment` model                                     | Validation, every path through every flow, a board, scenarios, types and documents |
| **[Facet](https://facet.mmmnt.dev)**    | Does the design behave the way it says it does?  | Nothing. Facet reads what Moment derives              | Every scenario replayed and asserted, before any code exists                       |
| **[Feature](https://feature.mmmnt.ai)** | Does the code do what the design decided?        | A `.feat` spec for each command, taken from the model | Test suites compiled from the spec, the same ones every time, which gate CI        |

**Facet** is Moment's sibling product, a proof harness for `.moment` designs. A Moment model says what should happen. Facet shows whether it does. It loads the topology and the scenarios Moment derives, replays each scenario's event stream step by step, and asserts at every step:

- the path taken
- each boundary crossing and its contract
- the branch evaluated and the terminal state
- saga transitions and policy chains

These are the questions a design review asks out loud and rarely answers: does this event carry every field the next context needs? Does every branch end somewhere deliberate? Does the policy really fire on the event we think it does? Facet answers them against the design itself. A broken crossing is a red step in a browser, not an incident after launch.

**Feature** comes next, once Facet has proven the flows. A `.feat` file is an execution specification for one command, query, policy or projection. It tells the builder, a person or an AI agent, what to build and what to refuse. It predicts every observable effect: the response, the events, the records written. Then it compiles, deterministically, into a complete test suite: no step definitions, no glue code. An effect the code produces that the spec did not predict is a failure. The design decided what the system does; Feature holds the code to it.

The order matters. A `.feat` spec is cheap to write correctly only once the design has stopped moving, and Facet is where it stops moving.

### TicketWave, end to end

[`examples/ticketwave/spec/ticketwave.moment`](examples/ticketwave/spec/ticketwave.moment) models a ticketing platform: seven bounded contexts (Catalog, Inventory, Checkout, Presale, Delivery, AntiFraud, Notifications), sixteen aggregates, and eight flows numbered N1 to N8. Here is one flow, **N5 Seat request**, taken through every step. A customer asks for seats. With seats in the pool they get a hold and a cart; with the tier sold out they join the waitlist.

**1. Model it.** The flow in `ticketwave.moment`. Its commands, events and preconditions are declared in the Inventory, Checkout and Presale contexts of the same file:

```moment
flow "N5 - Seat request"
  lane inventory "Inventory" [Core]
  lane presale "Presale" [Supporting]
  lane checkout "Checkout" [Core]

  moment "Seat request"
    inventory: RequestHold
    inventory: SeatsHeld

  moment "Availability decision" [branch]
    when seats-available
      checkout: CreateCart
        triggered-by SeatsHeld
      checkout: CartCreated
    when sold-out
      presale: JoinWaitlist
      presale: WaitlistJoined [outcome]
```

**2. Read it as a board.** `moment board` projects the whole model onto an event-storming board: [the TicketWave NDD board in Miro](https://miro.com/app/board/uXjVEKasFkQ=/). The board is one to one with the model. It has a frame for each context and aggregate, the policies and invariant coverage, and a thread for each flow, where each moment is a column and each context the flow crosses is a row. It is how a team reads and discusses a model without reading the syntax. Nothing on it is drawn by hand; what a workshop decides goes back into the `.moment` file, which redraws the board. [Thread N5](https://miro.com/app/board/uXjVEKasFkQ=/?moveToWidget=3458764691498020020) shows the two moments, both branch arms, and the three refusals that come from the commands' preconditions.

**3. Check it with the Moment CLI.** `moment parse` holds the model to the grammar and more than fifty validation rules. `moment simulate --all` derives a scenario for every path through every flow: 72 for TicketWave, written to [`examples/ticketwave/facet`](examples/ticketwave/facet). N5 derives five:

| Scenario                                                                    | Kind     | Events |
| --------------------------------------------------------------------------- | -------- | ------ |
| Happy Path: N5 - Seat request                                               | happy    | 5      |
| Variant: N5 - Seat request [sold-out]                                       | variant  | 5      |
| Failure: Requested quantity must be available in the pool not met           | negative | 2      |
| Failure: Customer must not exceed maximum concurrent holds not met          | negative | 2      |
| Failure: Customer must not already be on the waitlist for this tier not met | negative | 5      |

Nobody wrote the three negative scenarios. Each comes from a precondition. `moment generate` also writes the flow as readable documentation, a Gherkin `.feature` with one scenario per moment and branch arm, alongside TypeScript types and test scaffolds.

**4. Prove it in Facet.** [Open Facet](https://facet.mmmnt.dev); it loads TicketWave. Pick N5 and run its five scenarios, or run the suite for all 72. Each step of each event stream is checked against the topology, and a failure points at the moment and node where the design broke. For your own model, `moment serve` streams it to Facet over WebSocket and re-runs as you edit.

**5. Specify the build in Feature.** With N5 proven, each command it places becomes a `.feat` spec: `RequestHold`, `CreateCart` and `JoinWaitlist`. The mapping from the model is direct:

| In the `.moment` model                        | In the `.feat` spec                                                                     |
| --------------------------------------------- | --------------------------------------------------------------------------------------- |
| `context "Inventory"`, `aggregate "SeatHold"` | `context Inventory`, `aggregate SeatHold`                                               |
| `command RequestHold` and its `input` fields  | `spec … "RequestHold"`, `type command`, `contract: input RequestHoldInput`              |
| `emits SeatsHeld` and the event's fields      | `contract: event SeatsHeld` and the success prediction `eventStore has [ SeatsHeld … ]` |
| `precondition ticketsAvailable: "…"`          | `rejects TICKETS_AVAILABLE when …` and a scenario that predicts that rejection          |

```feat
feat 1.0

spec SPEC-INV-001 "RequestHold"
context Inventory
aggregate SeatHold
type command
status draft

construct:
  handler at src/inventory/request-hold.ts
  touches src/inventory/**

enforce:
  validate input against RequestHoldInput
  rejects TICKETS_AVAILABLE when the requested quantity is not available in the pool
  rejects CUSTOMER_HOLD_LIMIT when the customer already holds the maximum number of concurrent holds

contract:
  input RequestHoldInput
  response RequestHoldResponse
  event SeatsHeld
  error ErrorResponse

variables:
  event: string = unique()
  tier: string = unique()
  section: string = unique()
  customer: string = unique()
  session: string = unique()

scenario "seats are held":
  when: RequestHold { eventId: "${event}", tierId: "${tier}", sectionId: "${section}", quantity: 2, customerId: "${customer}", sessionId: "${session}" }
  predict success:
    response 201 RequestHoldResponse { holdId: any uuid }
    eventStore has [ SeatsHeld with SeatsHeld { eventId: @when.eventId, quantity: @when.quantity, customerId: @when.customerId } ]

scenario "refuses a quantity the pool does not have":
  given:
    The pool for this tier and section has one ticket left.
  when: RequestHold { eventId: "${event}", tierId: "${tier}", sectionId: "${section}", quantity: 2, customerId: "${customer}", sessionId: "${session}" }
  predict rejection TICKETS_AVAILABLE:
    response 409 ErrorResponse { code: "TICKETS_AVAILABLE" }
    eventStore has []
```

`feat generate` compiles this into a test suite, and `feat run` keeps it red until the handler behaves as predicted. Moment does not write `.feat` files yet: the spec above was written from the model by hand, and `feat parse` and `feat lint` accept it.

## Quick start

Moment requires **Node.js 22 or newer**.

```bash
npm install --save-dev @mmmnt/cli
```

A first model: two contexts and one flow. An order is placed in Ordering, and `OrderPlaced` crosses to Fulfillment under a **contract**, the fields Fulfillment requires. A policy reacts by reserving stock, and the reservation either succeeds or goes to backorder. Save it as `model/shop.moment`:

```moment
context "Ordering" [Core]
  aggregate "Order"
    identity orderId: UUID
    command PlaceOrder
      input customerId: UUID, total: number
      precondition notYetPlaced: "An order is placed once"
      emits OrderPlaced
    event OrderPlaced
      orderId: UUID
      customerId: UUID
      total: number

context "Fulfillment" [Supporting]
  aggregate "Shipment"
    identity shipmentId: UUID
    state initial InStock
    state InStock -> OutOfStock on ReserveStock
    command ReserveStock
      input orderId: UUID
      emits StockReserved when InStock | StockBackordered when OutOfStock
    event StockReserved
      shipmentId: UUID
      orderId: UUID
    event StockBackordered
      shipmentId: UUID
      orderId: UUID
  policy ReserveStockWhenOrderPlaced
    trigger OrderPlaced
    action "Reserve stock for the order"
    chains-to ReserveStock

flow "N1 - Checkout"
  lane ordering "Ordering" [Core]
  lane fulfillment "Fulfillment" [Supporting]

  moment "The customer places an order"
    ordering: PlaceOrder
    ordering: OrderPlaced crosses-to fulfillment via CustomerSupplier
      contract
        orderId: UUID [required]
        total: number [required]

  moment "Fulfillment reserves the stock" [branch]
    fulfillment: ReserveStock
      triggered-by OrderPlaced
    when inStock
      fulfillment: StockReserved
    when outOfStock
      fulfillment: StockBackordered
```

Then:

```bash
npx moment parse model/
npx moment generate model/shop.moment
npx moment simulate model/shop.moment --all
```

What each command makes of it:

| Command                                       | What you get                                                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `moment parse model/`                         | The model checked against the grammar and the validation rules, as one project                                                                    |
| `moment generate model/shop.moment`           | `features/n1-checkout.feature`, a TypeScript aggregate, types and `.spec.ts` scaffold per aggregate, a flow test scaffold, and `specification.md` |
| `moment simulate model/shop.moment --all`     | Three scenarios: the happy path, the `outOfStock` variant, and the failure when `notYetPlaced` is not met                                         |
| `moment schema emit model/ --out-dir schemas` | `OrderPlaced.schema.json`, `StockReserved.schema.json`, `StockBackordered.schema.json`                                                            |
| `moment board model/ --out board`             | An event-storming board as SVG frames: contexts, aggregates, policies, the thread of the flow, the context map, plus `manifest.json`              |

`npx moment --help` lists every command. To work with TicketWave itself, clone this repository and point the same commands at `examples/ticketwave/spec/`.

## What Moment does

|                                | Commands                           |                                                                                                                                        |
| ------------------------------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Model and check**            | `parse`, `watch`, `lint`, `status` | One file or a directory of files loaded as one project, held to grammar, completeness and palette rules                                |
| **Derive tests**               | `derive`, `test`, `cucumber-json`  | A test topology per flow: a case per moment and branch arm, an assertion per crossing, negative scenarios for every unmet precondition |
| **Generate**                   | `generate`, `emit-ts`              | Gherkin features, TypeScript types, aggregates and test scaffolds, specification documents                                             |
| **Simulate**                   | `simulate`, `serve`                | Event chains with causation and payloads for each path, served over WebSocket to [Facet](https://facet.mmmnt.dev)                      |
| **Visualise**                  | `viz`, `board`                     | A context map and timeline envelope, and a board of SVG frames with a manifest you can diff                                            |
| **Govern contracts**           | `schema emit`, `schema status`     | A closed JSON Schema per event payload, and the schema lifecycle report                                                                |
| **Keep implementation honest** | `sync`, `reconcile`                | Drift between model and code recorded as proposals you accept or reject, and upstream drift reconciled                                 |
| **Bring a model in**           | `init`, `import --from-sift`       | A new project manifest, or a model imported from a Sift export                                                                         |

Moment also runs as an MCP server ([`@mmmnt/mcp`](packages/mcp)), so an AI agent can validate, query and emit from your model without a network connection. A [VS Code extension](packages/vscode) highlights `.moment` files.

## Packages

Every `@mmmnt/*` package is released together at the same version.

| Package                                |                                                                                     |
| -------------------------------------- | ----------------------------------------------------------------------------------- |
| [`@mmmnt/cli`](packages/cli)           | The `moment` command                                                                |
| [`@mmmnt/core`](packages/core)         | Parser and intermediate representation for the Moment language                      |
| [`@mmmnt/derive`](packages/derive)     | Test topology, simulation scenarios, event catalogs and impact analysis             |
| [`@mmmnt/generate`](packages/generate) | Gherkin scenarios, specification documents and AsyncAPI contracts                   |
| [`@mmmnt/emit-ts`](packages/emit-ts)   | TypeScript types and test scaffolds                                                 |
| [`@mmmnt/harness`](packages/harness)   | Test execution with event replay and contract assertion                             |
| [`@mmmnt/schema`](packages/schema)     | Payload JSON Schemas and schema lifecycle governance                                |
| [`@mmmnt/sync`](packages/sync)         | Drift detection between model and implementation, and reconciliation                |
| [`@mmmnt/viz`](packages/viz)           | Context map and flow timeline visualisation                                         |
| [`@mmmnt/board`](packages/board)       | The model projected onto an event-storming board, one SVG per frame plus a manifest |
| [`@mmmnt/mcp`](packages/mcp)           | Model Context Protocol server exposing Moment as agent tools                        |

## Where Moment fits

Moment is the open-source core of the [Complai](https://moment.mmmnt.ai/ecosystem) ecosystem, and it runs entirely on its own: no `@mmmnt` package depends on any Complai service. Complai products plug in around it when you want them:

- **Sift** automates event storming and hands Moment a model to import.
- **[Facet](https://facet.mmmnt.dev)** is the proof harness: it replays Moment's scenarios and asserts every step of the design.
- **[Feature](https://feature.mmmnt.ai)** turns a proven design into `.feat` execution specs that compile into the tests the code must pass.

## Documentation

- **[moment.mmmnt.ai](https://moment.mmmnt.ai)**: what Moment is, the language at a glance, and examples
- **[The Moment DSL](https://github.com/mmmnt/mmmnt/wiki/The-Moment-DSL)**: the language, construct by construct
- **[Wiki](https://github.com/mmmnt/mmmnt/wiki)**: getting started, the pipeline, the architecture and the package reference
- **[Architecture decisions](docs/adr)**: why the language and the toolchain are the way they are
- Each package's `README.md` covers its API, and its `CHANGELOG.md` covers what changed in each release

## Developing Moment

```bash
git clone https://github.com/mmmnt/mmmnt.git
cd mmmnt
corepack enable              # uses the pnpm version pinned in package.json
pnpm install
pnpm turbo run build
pnpm turbo run test
```

Use `turbo run <task>`: a bare `turbo generate` runs Turbo's own code generator, not the packages' `generate` task. [CONTRIBUTING.md](CONTRIBUTING.md) covers commit conventions, changesets and pull requests.

## Releases

Packages are published to npm through [changesets](.changeset). Each publish is tagged and released on GitHub. The milestone tags `v0.1.0-m2`, `v0.1.0-m3`, `v0.1.0-m6`, `v0.4.0` and `v1.0.0` predate npm publishing and do not correspond to npm versions.

## Community

Join the [Discord server](https://discord.gg/YcRqsQUQuu) to discuss Moment, get help, and meet other teams doing domain-driven design.

## License

Moment is licensed under the [Functional Source License, Version 1.1, Apache 2.0 Future License](LICENSE.md) (FSL-1.1-Apache-2.0). You may read, use and modify it for any purpose except a competing commercial product. Two years after each version is released, that version becomes available under the [Apache License 2.0](http://www.apache.org/licenses/LICENSE-2.0).
