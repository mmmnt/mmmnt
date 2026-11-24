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

**See it first.** One example model, [TicketWave](examples/ticketwave/spec/ticketwave.moment), projected three ways: [as an event-storming board](https://miro.com/app/board/uXjVEKasFkQ=/), [as a running rehearsal in Facet](https://facet.mmmnt.dev), and [as Gherkin feature specifications](#one-flow-through-all-three-n5-seat-request). Nothing in any of them was drawn or written by hand.

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

## One model, three projections: TicketWave

[`examples/ticketwave/spec/ticketwave.moment`](examples/ticketwave/spec/ticketwave.moment) models a ticketing platform: seven bounded contexts (Catalog, Inventory, Checkout, Presale, Delivery, AntiFraud, Notifications), sixteen aggregates, and eight flows numbered N1 to N8. Everything below is projected from that one file. Change the file and every projection changes with it.

| Projection            | Open it                                                                  | Made by                                                                               | One to one with the model                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The board**         | [TicketWave NDD board in Miro](https://miro.com/app/board/uXjVEKasFkQ=/) | `moment board`                                                                        | Every context, aggregate, command, event, policy and precondition. One thread frame per flow, one column per moment, one row per context the flow crosses |
| **The rehearsal**     | [Facet](https://facet.mmmnt.dev)                                         | `moment simulate --all` into [`examples/ticketwave/facet`](examples/ticketwave/facet) | One scenario per path: 72 in all (8 happy, 4 variant, 10 failure, 48 negative, 2 saga timeouts)                                                           |
| **The specification** | the `features/` directory `moment generate` writes                       | `moment generate`                                                                     | One `.feature` per flow, one `Scenario` per moment and per branch arm                                                                                     |

The board is a projection, not a source: you read the `.moment` file through it, the way a client reads an API. Discussion happens on the board, and what the workshop decides goes back into the model, which redraws the board.

### One flow through all three: N5 Seat request

A customer asks for seats. With seats in the pool the customer gets a hold and a cart; with the tier sold out the customer joins the waitlist. In the model:

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

**On the board.** [Thread N5](https://miro.com/app/board/uXjVEKasFkQ=/?moveToWidget=3458764691498020020) has two columns, `N5.M1` and `N5.M2`, on the Inventory and Checkout rows. SYSTEM stacks `RequestHold` and `SeatsHeld`. BRANCH holds the two arms, `seats-available` and `sold-out`, and the three refusals that Moment derives from the commands' preconditions (`ticketsAvailable`, `customerHoldLimit`, `notAlreadyOnWaitlist`). The aggregate, policy and invariant frames are on the same board.

**In Facet.** [Facet](https://facet.mmmnt.dev) is the visual test surface of the Complai ecosystem. It draws a flow's topology as lanes (contexts), frames (moments) and crossings, then walks each scenario's event stream step by step. At each step it asserts the path, the boundary crossings and their contracts, the branch taken, the terminal state, saga transitions and policy chains. It opens on TicketWave. N5 rehearses as five scenarios:

| Scenario                                                                    | Kind     | Events |
| --------------------------------------------------------------------------- | -------- | ------ |
| Happy Path: N5 - Seat request                                               | happy    | 5      |
| Variant: N5 - Seat request [sold-out]                                       | variant  | 5      |
| Failure: Requested quantity must be available in the pool not met           | negative | 2      |
| Failure: Customer must not exceed maximum concurrent holds not met          | negative | 2      |
| Failure: Customer must not already be on the waitlist for this tier not met | negative | 5      |

Nobody wrote the three negative scenarios. Each one comes from a precondition in the model. To rehearse your own model, run `moment serve`: Facet connects over WebSocket and re-plays as you edit.

**In the specification.** `moment generate` writes `features/n5-seat-request.feature`. The flow is the `Feature`, each context it touches is a `Rule`, each moment is a `Scenario`, each branch arm is its own `Scenario`, and the preconditions become `Given` steps:

```gherkin
Feature: N5 - Seat request
  A customer asks for seats. With seats in the pool the customer gets a hold; with the tier sold out the customer joins the waitlist.

  Rule: Inventory [Core]

    Background:
      Given Requested quantity must be available in the pool
      Given Customer must not exceed maximum concurrent holds

    @aggregate:SeatHold @saga:SeatHoldLifecycle @invariant:INV-02 @invariant:INV-03 @invariant:INV-04
    Scenario: Seat request
      When Inventory performs RequestHold with eventId, tierId, sectionId, quantity, customerId, sessionId
      Then Inventory emits SeatsHeld
        carrying holdId, eventId, tierId, sectionId, quantity, customerId, sessionId, expiresAt, heldAt

  Rule: Checkout [Core]

    @aggregate:Cart @invariant:CHK-01 @invariant:CHK-04 @alt-path
    Scenario: Availability decision [seats-available]
      Given SeatsHeld has occurred
      When Checkout performs CreateCart with customerId, sessionId
      Then Checkout emits CartCreated
        carrying cartId, customerId, sessionId, createdAt

    @terminal @alt-path
    Scenario: Availability decision [sold-out]
      Given the availability decision is evaluated
      When the outcome is sold-out
      Given Customer must not already be on the waitlist for this tier
      When Presale performs JoinWaitlist with eventId, tierId, customerId, requestedQuantity
      Then Presale emits WaitlistJoined (outcome)
        carrying waitlistId, eventId, tierId, customerId, requestedQuantity, position, joinedAt
      Then the flow ends at WaitlistJoined
```

The payload fields come from the event declarations in the contexts, so the specification can't drift from the types `moment emit-ts` generates. With each flow, the same command also writes a TypeScript aggregate, types, a `.spec.ts` scaffold, and a `specification.md` for the whole model.

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
- **[Facet](https://facet.mmmnt.dev)** plays Moment's simulation scenarios as a visual test of every crossing.

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
