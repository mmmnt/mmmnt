/**
 * ADR-037 — model completeness checks V22–V28 over an IR.
 *
 * They compare names across declarations, so they run on the IR: per file as
 * advisories (a file cannot see its siblings) and over the merged project as
 * errors (ADR-034 G8's split between per-file and post-merge validation).
 */
import type { ContextDefinition, Diagnostic, IntermediateRepresentation } from '../ir/index.js';

type Finding = Pick<Diagnostic, 'message' | 'ruleId'>;

function namesOf(ir: IntermediateRepresentation): {
  events: Set<string>;
  valueObjects: Set<string>;
  projections: Set<string>;
} {
  const contexts = ir.contexts;
  return {
    events: new Set(contexts.flatMap((c) => c.events.map((e) => e.name))),
    valueObjects: new Set(contexts.flatMap((c) => c.valueObjects.map((v) => v.name))),
    projections: new Set(contexts.flatMap((c) => (c.projections ?? []).map((p) => p.name))),
  };
}

function duplicates(names: string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) repeated.add(name);
    seen.add(name);
  }
  return [...repeated];
}

type Known = ReturnType<typeof namesOf>;

const v22 = (ctx: ContextDefinition, known: Known): Finding[] =>
  (ctx.projections ?? []).flatMap((p) =>
    p.sources
      .filter((s) => !known.events.has(s))
      .map((source) => ({
        ruleId: 'V22',
        message: `Projection '${p.name}' reads '${source}', which is no declared event.`,
      })),
  );

const v23 = (ctx: ContextDefinition, known: Known): Finding[] =>
  (ctx.queries ?? []).flatMap((q) =>
    q.reads
      .filter((r) => !known.projections.has(r) && !known.valueObjects.has(r))
      .map((read) => ({
        ruleId: 'V23',
        message: `Query '${q.name}' reads '${read}', which is no declared projection or value object.`,
      })),
  );

function v24(ctx: ContextDefinition): Finding[] {
  const enforcers = new Set([
    ...ctx.domainServices.map((s) => s.name),
    ...(ctx.queries ?? []).map((q) => q.name),
  ]);
  return (ctx.rules ?? [])
    .filter((r) => r.enforcerKind === 'declared' && !enforcers.has(r.enforcedBy))
    .map((r) => ({
      ruleId: 'V24',
      message: `Rule '${r.id}' is enforced by '${r.enforcedBy}', which is no service or query of context '${ctx.name}'.`,
    }));
}

const v25 = (ctx: ContextDefinition): Finding[] =>
  duplicates(ctx.valueObjects.map((v) => v.name)).map((name) => ({
    ruleId: 'V25',
    message: `Value object '${name}' is declared more than once in context '${ctx.name}'.`,
  }));

const v26 = (ctx: ContextDefinition, terms: string[]): Finding[] =>
  duplicates(terms).map((term) => ({
    ruleId: 'V26',
    message: `Term '${term}' is defined more than once in context '${ctx.name}'.`,
  }));

function v28(ctx: ContextDefinition, known: Known): Finding[] {
  const io = new Set([...known.events, ...known.valueObjects]);
  return ctx.domainServices.flatMap((s) =>
    (
      [
        ['consumes', s.consumes],
        ['produces', s.produces],
      ] as const
    )
      .filter(([, name]) => !io.has(name))
      .map(([verb, name]) => ({
        ruleId: 'V28',
        message: `Service '${s.name}' ${verb} '${name}', which is no declared event or value object.`,
      })),
  );
}

const checkContext = (ctx: ContextDefinition, known: Known, terms: string[]): Finding[] => [
  ...v22(ctx, known),
  ...v23(ctx, known),
  ...v24(ctx),
  ...v25(ctx),
  ...v26(ctx, terms),
  ...v28(ctx, known),
];

function checkExternals(ir: IntermediateRepresentation): Finding[] {
  const out: Finding[] = [];
  const ends = new Set([...ir.contexts.map((c) => c.id), ...(ir.externals ?? []).map((e) => e.id)]);
  const externalNames = new Set((ir.externals ?? []).map((e) => e.name));
  for (const rel of ir.relationships) {
    for (const end of [rel.sourceContextId, rel.targetContextId].filter((e) => !ends.has(e))) {
      out.push({
        ruleId: 'V27',
        message: `Relationship end '${end.replace(/^(ctx|ext)-/, '')}' is no declared context or external.`,
      });
    }
  }
  for (const flow of ir.flows) {
    for (const lane of flow.lanes.filter(
      (l) => l.classification === 'External' && !externalNames.has(l.label),
    )) {
      out.push({
        ruleId: 'V27',
        message: `Lane '${lane.id}' is classified External but '${lane.label}' is no declared external.`,
      });
    }
  }
  return out;
}

/** Every V22–V28 finding of an IR, in declaration order. Severity is the caller's (see the module comment). */
export function validateModelCompleteness(ir: IntermediateRepresentation): Finding[] {
  const known = namesOf(ir);
  const termsByContext = (name: string): string[] =>
    ir.glossary.filter((g) => g.context === name).map((g) => g.term);
  return [
    ...ir.contexts.flatMap((ctx) => checkContext(ctx, known, termsByContext(ctx.name))),
    ...checkExternals(ir),
  ];
}
