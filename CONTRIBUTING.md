# Contributing to Moment

Thank you for your interest in contributing to Moment.

## License

Moment is licensed under the [Functional Source License, Version 1.1, Apache 2.0 Future License (FSL-1.1-Apache-2.0)](LICENSE.md). By submitting a contribution (via pull request, issue, or any other mechanism), you agree that your contribution is provided under the same FSL 1.1 license terms described in [LICENSE.md](LICENSE.md).

Please read the license before contributing. Key points:

- Your contribution will be available under FSL 1.1 terms immediately.
- On the change date (two years from first publish), your contribution will automatically become available under the Apache License, Version 2.0.
- The FSL 1.1 prohibits competing commercial use. See [LICENSE.md](LICENSE.md) for the full definition of Permitted Purpose.

## Development Setup

Requirements:

- Node.js 22 or newer (CI tests on Node 22 and 24)
- pnpm 10.29.3 (the version pinned in `packageManager`; `corepack enable` selects it)

```bash
pnpm install          # installs dependencies and the git hooks
pnpm turbo build      # generates the Langium parser, then builds every package
pnpm turbo test       # unit tests for every package
pnpm turbo lint       # ESLint for every package
pnpm format:check     # Prettier
```

To work on one package, filter by name: `pnpm turbo build --filter=@mmmnt/core`, `pnpm --filter @mmmnt/core test`. After a build, `pnpm moment <command>` runs the local CLI.

## Commits

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) and are checked by commitlint in the `commit-msg` hook (`commitlint.config.mjs`):

- **Types:** `feat`, `fix`, `test`, `refactor`, `chore`, `docs`, `ci`
- **Scopes (optional):** `core`, `derive`, `generate`, `harness`, `viz`, `emit-ts`, `sync`, `schema`, `cli`, `mcp`

For example: `fix(sync): refuse a rejection without a reason`.

The `pre-commit` hook runs ESLint and Prettier on staged files through lint-staged. Commits on `main` must be signed, so configure commit signing (GPG or SSH) before you open a pull request.

## Changesets

A change that affects a published package needs a changeset. Run `pnpm changeset`, choose the packages and the bump, and commit the generated file in `.changeset/`. The `@mmmnt/*` packages are a fixed version group: they are always released together at the same version.

## How to Contribute

1. **Fork** the repository.
2. **Create a branch** from `main` for your change.
3. **Make your changes** on your branch, with tests, and a changeset where needed.
4. **Submit a pull request** back to this repository. CI must pass, and a pull request needs an approving review before it merges.

## Reporting Issues

If you find a bug or have a feature request, please open an issue on the GitHub repository.
