---
'@mmmnt/cli': patch
---

**fix(cli): make the `moment` binary discoverable in workspace consumers**

- Enable workspace package hoisting so `@mmmnt/cli`'s `moment` binary lands
  on the `PATH` in repos that consume the package.
- Add a top-level `moment` script to the root `package.json` so `pnpm moment`
  works from any workspace package.
