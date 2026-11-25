# Moment for Visual Studio Code

Syntax highlighting and editor settings for **Moment** (`.moment`) specification files.

Moment is a specification language for event-driven, domain-driven design. A `.moment` file declares bounded contexts, aggregates, commands, events, policies and orchestrations, and the flows that carry events between contexts. See the [Moment README](https://github.com/mmmnt/mmmnt/blob/main/README.md) for the language and its toolchain.

## What the extension does

The extension contributes a language (`moment`, for files ending in `.moment`) with a TextMate grammar and a language configuration. It has no code of its own: no language server, no diagnostics, no completion and no commands. Validation comes from the `moment` CLI.

| Feature              | Details                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keyword highlighting | Every keyword of the grammar, in one scope (`keyword.control.moment`): declarations (`context`, `aggregate`, `command`, `event`, `policy`, `orchestration`, `saga`, `projection`, `query`, `value-object` and others), flow constructs (`flow`, `lane`, `moment`, `when`, `triggers`, `triggered-by`, `crosses-to`, `returns-to`, `via`, `contract`), built-in types (`string`, `number`, `boolean`, `UUID`, `DateTime`, `Date`, `Money`), classifications and relationship patterns, and the attributes `[branch]`, `[required]` and `[encrypted]` |
| Strings              | Double-quoted strings (`string.quoted.double.moment`), with escape sequences                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Comments             | `//` line comments and `/* */` block comments, highlighted and toggled with the usual shortcuts                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Brackets             | Matching and auto-closing for `[ ]` and `( )`. Auto-closing for `"` (outside strings and comments) and `/*`. Surrounding a selection with `[ ]`, `( )` or `"`                                                                                                                                                                                                                                                                                                                                                                                       |

The grammar in `syntaxes/moment.tmLanguage.json` is the one `@mmmnt/core` ships: Langium generates it from the core grammar into [`packages/core/syntaxes/`](https://github.com/mmmnt/mmmnt/tree/main/packages/core/syntaxes), and packaging the extension copies it here. A keyword added to the core grammar is highlighted from the next release.

## Install

The extension needs VS Code 1.75 or newer. It is published as `mmmnt.moment-language` on two registries:

- **VS Code Marketplace**, for Visual Studio Code: search for "Moment" in the Extensions view, or run `code --install-extension mmmnt.moment-language`. The listing is [marketplace.visualstudio.com/items?itemName=mmmnt.moment-language](https://marketplace.visualstudio.com/items?itemName=mmmnt.moment-language).
- **Open VSX**, for VSCodium, Cursor, Windsurf, Gitpod and other editors built on VS Code: search for "Moment" in the editor's Extensions view. The listing is [open-vsx.org/extension/mmmnt/moment-language](https://open-vsx.org/extension/mmmnt/moment-language).

## Releases

The extension is released with the Moment toolchain, at its version: each release of `@mmmnt/cli` publishes the extension at the same version, with the grammar `@mmmnt/core` ships at that version. The [changelog](CHANGELOG.md) is the toolchain's.

To build a `.vsix` from a checkout of the repository instead, run this in `packages/vscode`. Packaging copies the grammar from `@mmmnt/core` first.

```bash
npx @vscode/vsce package --no-dependencies          # writes moment-language-<version>.vsix
code --install-extension moment-language-<version>.vsix
```

You can also install a `.vsix` from VS Code: open the Extensions view, choose **Install from VSIX…** in its `…` menu, and pick the file.

## Example

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

This flow is from [TicketWave](https://github.com/mmmnt/mmmnt/blob/main/examples/ticketwave/spec/ticketwave.moment).

## Related tooling

- The `moment` CLI (`@mmmnt/cli`, Node.js 22 or newer) parses and validates `.moment` files and derives scenarios, types, schemas, documents and boards from them. `npx moment --help` lists every command.
- [Facet](https://facet.mmmnt.dev) replays the scenarios Moment derives. `moment serve` streams a model to it over WebSocket.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

[FSL-1.1-Apache-2.0](LICENSE.md)
