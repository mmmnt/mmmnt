---
'@mmmnt/core': patch
---

**fix(core): reject absolute / escaping paths in manifest fields**

`ManifestReader` now validates that `generators[].outputDir`,
`contexts[].path`, and `flows[].path` in a `.manifest.yaml` are relative
paths that stay inside the manifest directory. Previously any of these
fields could be an absolute path (`/etc/evil`) or use `../` to climb
outside the project, and downstream consumers would honor them:

- A malicious `outputDir` would make `moment generate` / `moment emit-ts`
  write outside the project (path-traversal write).
- A malicious `contexts[].path` / `flows[].path` would make the parser
  read and interpret arbitrary files as `.moment` specs.

Both are now rejected at manifest-load time with a clear diagnostic
pointing at the specific field:

```
Manifest validation failed: generators[0].outputDir '/etc/evil' must be
a relative path (absolute paths are rejected).
```

The boundary check uses a path-separator boundary so `/base-sibling`
can't masquerade as being inside `/base` — same shape as the guard in
`@mmmnt/cli`'s `project-fs.ts`, duplicated locally because `@mmmnt/core`
cannot depend on `@mmmnt/cli`.

Closes P2 #6 from the post-mortem.
