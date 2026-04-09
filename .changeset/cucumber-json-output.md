---
'@mmmnt/cli': minor
'@mmmnt/generate': minor
---

**feat(generate): Cucumber JSON formatter and `moment cucumber-json` command**

Adds a Cucumber JSON formatter to `@mmmnt/generate` and a corresponding
`moment cucumber-json <file.moment>` CLI command. Output is suitable for
import into Xray (Jira test management) via the
`/import/execution/cucumber` endpoint, enabling Moment-derived BDD scenarios
to flow directly into existing test management workflows.
