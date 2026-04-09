---
'@mmmnt/cli': patch
'@mmmnt/core': patch
---

**fix(cli): `moment generate` and `moment emit-ts` now write outputs to disk**

`runGenerate` and `runEmitTs` previously invoked the emitters but only
reported counts from the in-memory `Map<string, string>` — no files were
ever persisted. In a fresh project both commands printed a success message
while producing zero artifacts on disk.

- New shared `project-fs` helper resolves the output base directory
  (project root from `.manifest.yaml` or `cwd`) and writes files to disk.
- `generate` writes TypeScript types, test scaffolds, `.feature` files,
  and `specification.md`.
- `emit-ts` writes TS types and scaffolds, still honors `--dry-run`.
- Both commands accept `--out <dir>` for an explicit output override.
- The writer rejects absolute paths and verifies each resolved target stays
  inside `baseDir` using a path-separator boundary check (defense in depth
  against path traversal via user-controlled names in `.moment` specs).

**fix(core): move `langium` to runtime dependencies**

`@mmmnt/core`'s generated parser plus `parser/`, `validation/`, and
`moment-module.ts` all `import from 'langium'` at runtime, but it was
declared only in `devDependencies`. Consumers installing `@mmmnt/core` had
no way to resolve it, breaking any command that parses a `.moment` file in
a fresh install. Moved `langium: 4.2.1` to `dependencies`; `langium-cli`
stays in `devDependencies`.
