# ADR-013: Software License — FSL-1.1-Apache-2.0

Migrated from Confluence page 13795329 (version 1, last updated 2026-03-10), https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/13795329. The Confluence space is private; this file is now the record.

- **Status:** Accepted
- **Author:** listenrightmeow
- **Created:** 2026-03-09
- **Governs:** All @mmmnt packages, repository root

## Context

Moment (mmmnt) is an open-source DSL and toolchain for temporal DDD modeling. The five @mmmnt packages (core, derive, generate, harness, viz) plus CLI constitute the specification layer of the Complai platform. Complai's commercial products (Sift, Seam, Forge) build on top of these packages as the automation layer.

The licensing decision must balance two competing concerns:

- Adoption — The .moment format needs to become a standard. Restrictive licenses suppress adoption. Every .moment file written anywhere is a potential Complai customer.

- Protection — The derivation engine (@mmmnt/derive) and generation pipeline (@mmmnt/generate) encode non-trivial domain IP — the 14×11×config mapping logic, relationship-type-aware test generation, and the temporal DDD methodology itself. A permissive license gives this away unconditionally.

## Decision

All @mmmnt packages and the moment CLI are licensed under FSL-1.1-Apache-2.0 (Functional Source License 1.1, converting to Apache License 2.0).

### Key Terms

- Current license: FSL 1.1 — source-available, allows use and modification, prohibits competing commercial products

- Change date: 2 years from first published version date

- Conversion license: Apache License 2.0 — fully permissive open source with explicit patent grant

- Licensor: Winnovation

### Implementation

| Artifact                    | Value                                                                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Repository root             | LICENSE.md containing full FSL 1.1 text with Winnovation as licensor, Moment as software name, change date = first publish date + 2 years |
| package.json (all packages) | "license": "SEE LICENSE IN LICENSE.md"                                                                                                    |
| npm publish                 | License field uses npm escape hatch since FSL-1.1-Apache-2.0 is not in the SPDX registry                                                  |
| GitHub repo settings        | License detected as "Other" — this is expected; GitHub reads from LICENSE.md                                                              |
| README.md                   | License badge and brief explanation of FSL → Apache 2.0 conversion                                                                        |

### What FSL Permits

- Reading, studying, and learning from the source code

- Using the packages in any project (commercial or non-commercial)

- Modifying the packages for internal use

- Contributing back to the project

- Building products that use Moment (consuming .moment files, integrating the parser)

### What FSL Prohibits (Until Change Date)

- Building a competing commercial product that provides substantially the same functionality as Moment's temporal DDD specification, derivation, or generation capabilities

- Offering a hosted/managed service that repackages Moment's core functionality as a product

### After Change Date

All code automatically converts to Apache 2.0. No action required. Full permissive open source with patent grant.

## Rationale

### Why Not MIT

MIT gives away the derivation engine and generation pipeline unconditionally. A competitor could fork the packages, build their own AI pipeline to produce .moment files, and ship a competing product without contributing anything back. At this stage — pre-revenue, solo practitioner — there is no market position or distribution advantage that makes this a safe bet. Redis and Elasticsearch both eventually re-licensed away from permissive after cloud providers offered managed versions of their engines.

### Why Not AGPL

AGPL's copyleft triggers on network use, which would force anyone building a SaaS on Moment to open-source their modifications. This is strong protection but carries significant adoption risk — many enterprise legal teams have blanket AGPL bans. The target audience (DDD practitioners at mid-to-large organizations) would be blocked from adoption by their own legal departments.

### Why Not Apache 2.0

Apache 2.0 adds patent protection over MIT but is equally permissive regarding forks and competing products. Same fundamental risk as MIT.

### Why Not Dual License (AGPL + Commercial)

Dual licensing (MySQL/Qt model) maximizes both adoption and protection but adds business complexity: commercial license pricing, sales process, legal infrastructure. This is premature for an alpha-stage solo practitioner. FSL achieves similar protection with zero business overhead — the license text itself is the mechanism.

### Why FSL

FSL threads the needle between adoption and protection:

- Source-available from day one — anyone can read, learn, and use the code

- No adoption friction — using the packages in your project is permitted regardless of your project's license

- Competition protection during the critical window — the 2-year conversion period covers the period where Complai needs to establish itself as the canonical platform

- Automatic conversion to Apache 2.0 — no trust issue; the conversion is in the license text, not a promise

- Precedent — Sentry, Codecov, and other developer tools have adopted FSL successfully without adoption penalties

The 2-year window aligns with the strategic timeline: by the time the packages convert to Apache 2.0, Complai's integration depth (Sift → Moment → Seam → Forge) should be the moat, not the individual packages.

## Rejected Alternatives

| Alternative                           | Reason                                                                            |
| ------------------------------------- | --------------------------------------------------------------------------------- |
| MIT                                   | No protection for derivation engine IP; premature commoditization                 |
| Apache 2.0                            | Same permissiveness problem as MIT, patent grant alone insufficient               |
| AGPL                                  | Enterprise adoption friction; blanket bans at target organizations                |
| Dual license (AGPL + Commercial)      | Business complexity premature at alpha stage                                      |
| BSL (Business Source License)         | Similar to FSL but less community adoption; FSL has cleaner conversion semantics  |
| Proprietary + open-source parser only | Fragments the package family; derivation and generation are where the value lives |

## Consequences

- Every @mmmnt package package.json uses "license": "SEE LICENSE IN LICENSE.md" — not a standard SPDX identifier

- npm will show a non-standard license — this is expected and acceptable for the target audience (DDD practitioners, not casual npm users)

- The change date must be set at first publish and documented in LICENSE.md — it cannot be extended retroactively

- Contributors must understand they are contributing under FSL terms (CONTRIBUTING.md must state this)

- LICENSE.md creation is a prerequisite for the first npm publish (story 5.2.3) and should be among the first repository artifacts (story 1.1.1)

## References

- FSL canonical text: https://fsl.software

- Sentry's FSL adoption: https://blog.sentry.io/introducing-the-functional-source-license/

- npm license field documentation: https://docs.npmjs.com/cli/v10/configuring-npm/package-json#license

\<!-- END_DOCUMENT -->
