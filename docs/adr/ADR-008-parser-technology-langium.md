# ADR-008: Parser Technology — Langium

Migrated from Confluence page 12648449 (version 1, last updated 2026-03-09), https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/12648449. The Confluence space is private; this file is now the record.

- **Status:** Accepted
- **Date:** March 9, 2026
- **Deciders:** listenrightmeow, Claude (DDD Coaching Project)
- **Tags:** @mmmnt/core, parser, LSP, grammar
- **Gap Report Ref:** SG-01, DG-01 (Pass 1)

## Context

The Moment DSL (.moment files) requires a parser to transform human-readable temporal flow specifications into the MomentData intermediate representation consumed by the rest of the pipeline. The MomentParser consistency unit in the Specification context (@mmmnt/core) owns the full pipeline: lexer → AST → name resolution → validation → IR production.

The parser technology choice determines three things simultaneously:

- Parser quality: How the grammar is defined, maintained, and evolved. The .moment grammar has 14 core constructs (moment, lane, branch-lane, phase, when, crosses-to, triggered-by, returns-to, saga, optional, terminal, multiplicity, via, and entry annotations). The grammar is small but has context-sensitive name resolution (entry names resolve against the Event Manifest, scoped by lane context).

- IDE integration: The target audience writes .moment files in AI-assisted editors — VS Code, Cursor, Windsurf, Zed. LSP support (syntax highlighting, autocomplete, inline validation, go-to-definition) is the baseline expectation, not a nice-to-have. The PRD positions IDE integration as a V1 adoption requirement.

- Runtime dependency footprint: The published @mmmnt/core package must have zero runtime dependencies on parser framework internals. Design principle #3 (pure computation, zero infrastructure) and principle #9 (Langium grammar as single source of truth) both constrain the choice.

Three parser technologies were evaluated:

- Langium: Grammar engineering framework from the Eclipse ecosystem. Defines grammar in EBNF notation. Generates TypeScript parser, AST node types, and a full LSP server from the single grammar file. Langium is a dev/build dependency; the generated output is pure TypeScript.

- Tree-sitter: Incremental parsing framework. Grammars defined in JavaScript DSL, parser generated as C/Rust compiled library with WASM bindings. Excellent editor integration via the tree-sitter ecosystem. Used by Zed, Neovim, and others natively.

- Hand-written recursive descent: Custom parser written directly in TypeScript. Full control over error recovery, diagnostics, and AST shape. No framework dependency. Common approach for small DSLs.

## Decision

### Langium

The .moment DSL parser is built with Langium. The grammar is defined once in Langium's EBNF notation. Langium generates:

- TypeScript parser with full error recovery

- Typed AST node interfaces derived from the grammar rules

- LSP server with syntax highlighting, completion, validation, go-to-definition, hover, and find-references — all generated from the grammar definition

- Document services for incremental parsing, cross-reference resolution, and workspace indexing

Build-time vs. runtime boundary: Langium is a devDependency in the @mmmnt/core package. The build step runs langium generate to produce TypeScript source files (parser, AST types, LSP services). The published npm package ships only the generated TypeScript — consumers of @mmmnt/core never install Langium. Zero runtime Langium dependency.

Grammar location: packages/core/src/grammar/moment.langium — the single source of truth for the DSL syntax. All parser behavior, AST types, and LSP features derive from this file.

LSP distribution: The generated LSP server ships as a VS Code extension (@mmmnt/vscode) and is available as a standalone language server for other editors. The extension is published alongside V1 — not deferred to V1.1.

Name resolution integration: Langium's scoping and linking infrastructure handles the context-sensitive name resolution (DSL entry names → manifest entries, scoped by lane context). The NameResolver domain service integrates with Langium's default scope provider, overriding it with manifest-aware resolution logic.

## Consequences

What becomes easier:

- Grammar changes propagate to parser, AST types, and LSP simultaneously — no manual synchronization across three separate implementations

- IDE integration is a build artifact, not a separate development effort. The LSP server is generated, tested against the grammar, and maintained as the grammar evolves

- Error recovery is handled by Langium's framework — no custom recovery logic for partial parse states during editing

- AST node types are generated with full TypeScript typing — downstream consumers (DerivationEngine, NameResolver, Visualization) work with typed AST nodes, not untyped parse trees

- New DSL constructs (V2+ extensions) require only grammar additions — the parser, AST types, and LSP features regenerate automatically

What becomes harder:

- The build step adds complexity — langium generate must run before TypeScript compilation. The Turborepo pipeline must sequence this correctly

- Langium's scoping model may not map perfectly to Moment's manifest-aware name resolution — the NameResolver domain service bridges this gap, but the integration surface requires Langium-specific knowledge

- Contributors modifying the grammar need familiarity with Langium's EBNF dialect, which differs slightly from standard EBNF (Xtext heritage)

- Langium is maintained by the TypeFox/Eclipse community — dependency on an external project's maintenance cadence. Mitigation: the generated output is pure TypeScript, so the project could freeze the Langium version and still ship a working parser

What to watch:

- Langium version stability — track major releases for breaking changes to the generation pipeline

- Build time impact — langium generate adds a build step. Monitor for acceptable developer experience (target: under 5 seconds for regeneration)

- Whether Langium's default error recovery is sufficient for .moment files or whether custom recovery strategies are needed for the name resolution pass

## Alternatives Considered

1. Tree-sitter (rejected): Tree-sitter produces excellent incremental parsing performance and has deep editor integration in Zed and Neovim. Rejected because it generates a C/Rust compiled parser distributed as a WASM binary or native module. This violates principle #3 — @mmmnt/core must run anywhere TypeScript runs with zero native dependencies. The C/WASM build chain also breaks the "no build step at runtime" guarantee for consumers. Tree-sitter's editor integration requires a separate tree-sitter grammar file that doesn't share a source of truth with an LSP server — you'd maintain both a tree-sitter grammar (for syntax highlighting) and a separate language server (for semantics), doubling the grammar maintenance surface.

2. Hand-written recursive descent (rejected): A custom TypeScript parser was considered for its zero-dependency simplicity and full control over error messages. Rejected because it requires building the LSP server as a completely separate effort. For a 14-construct grammar, the parser itself is straightforward — but the LSP (completion, hover, go-to-definition, find-references, diagnostics, incremental parsing) is a multi-month engineering effort that Langium generates for free. The LOE tradeoff is clear: Langium's framework overhead is justified by the LSP payoff. A hand-written parser would also produce untyped AST nodes requiring manual type definitions that must stay synchronized with the grammar.

3. Chevrotain (rejected): Chevrotain is a TypeScript parser building toolkit that generates parsers from embedded DSL definitions. It produces fast parsers with good error recovery. Rejected because it provides no LSP generation — the same IDE integration gap as hand-written parsers. Chevrotain's grammar definition is also imperative (JavaScript/TypeScript code), not declarative (EBNF), making it harder to reason about grammar evolution and harder for non-parser-experts to contribute.

4. ANTLR (rejected): ANTLR is the most widely used parser generator. Generates parsers in multiple target languages from .g4 grammar files. Rejected because ANTLR's TypeScript target (antlr4ts) has limited maintenance, and ANTLR provides no LSP generation. The Java toolchain dependency (ANTLR's generator runs on JVM) also adds build complexity for a TypeScript-native project.
