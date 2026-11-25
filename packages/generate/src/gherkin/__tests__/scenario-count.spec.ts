/**
 * `scenarioCount` is the number of `Scenario:` blocks a feature holds, and a feature carries only the keys
 * `GeneratedFeatureFile` declares. The count is checked against the Cucumber parser, over TicketWave and
 * every valid fixture, so a scenario kind the count misses (a saga) or adds (a note-only moment) fails.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AstBuilder, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';
import { IdGenerator, type FeatureChild, type RuleChild } from '@cucumber/messages';
import { MomentParser, ProjectLoader, type IntermediateRepresentation } from '@mmmnt/core';
import { deriveTopology } from '@mmmnt/derive';
import { GherkinGenerator } from '../gherkin-generator.js';
import type { GeneratedFeatureFile } from '../../types/index.js';

const ROOT = resolve(import.meta.dirname, '../../../../..');
const TICKETWAVE = join(ROOT, 'examples/ticketwave/spec');
const FIXTURES = join(ROOT, 'fixtures/valid');

function momentFiles(path: string): string[] {
  if (statSync(path).isFile()) return path.endsWith('.moment') ? [path] : [];
  return readdirSync(path)
    .sort()
    .flatMap((entry) => momentFiles(join(path, entry)));
}

async function loadModel(path: string): Promise<IntermediateRepresentation> {
  const { ir } = await new ProjectLoader().loadProject(momentFiles(path));
  if (!ir) throw new Error(`${path} did not load`);
  return ir;
}

function features(ir: IntermediateRepresentation): GeneratedFeatureFile[] {
  return new GherkinGenerator().generate(ir, deriveTopology(ir)).featuresGenerated;
}

/** The scenarios the Cucumber parser finds, in the feature and in its rules, reading the text as written. */
function parsedScenarioCount(content: string): number {
  const parser = new Parser(new AstBuilder(IdGenerator.uuid()), new GherkinClassicTokenMatcher());
  const children: readonly (FeatureChild | RuleChild)[] =
    parser.parse(content).feature?.children ?? [];
  return children.reduce(
    (sum, child) =>
      sum +
      (child.scenario ? 1 : 0) +
      ('rule' in child && child.rule ? child.rule.children.filter((c) => c.scenario).length : 0),
    0,
  );
}

const MODELS = [
  TICKETWAVE,
  ...readdirSync(FIXTURES)
    .sort()
    .map((entry) => join(FIXTURES, entry))
    .filter((path) => momentFiles(path).length > 0),
];

describe('scenarioCount', () => {
  it.each(MODELS.map((path) => [path.slice(ROOT.length + 1), path]))(
    '%s: every feature counts the scenarios it renders',
    async (_name, path) => {
      for (const feature of features(await loadModel(path))) {
        const rendered = (feature.content.match(/^\s*Scenario:/gm) ?? []).length;
        expect(feature.scenarioCount, feature.filePath).toBe(parsedScenarioCount(feature.content));
        expect(feature.scenarioCount, feature.filePath).toBe(rendered);
      }
    },
  );

  it('counts the saga scenarios of TicketWave: N1 has 22, N3 has 10', async () => {
    const byPath = new Map(
      features(await loadModel(TICKETWAVE)).map((f) => [f.filePath, f.scenarioCount]),
    );
    expect(byPath.get('features/n1-general-admission-purchase.feature')).toBe(22);
    expect(byPath.get('features/n3-ticket-transfer.feature')).toBe(10);
  });

  it('adds nothing for a moment that holds only notes', async () => {
    const source = `
context "Orders" [Core]
  aggregate "Order"
    identity orderId: UUID
    command Place
      input orderId: UUID
      emits Placed
    event Placed
      orderId: UUID

flow "Ordering"
  lane o "Orders" [Core]
  moment "An order is placed"
    o: Place
    o: Placed
  moment "Later"
    note o: "Someone looks at it"
`;
    const result = await new MomentParser().parseContent(source);
    if (!result.ir) throw new Error(result.diagnostics.map((d) => d.message).join('; '));
    const [feature] = features(result.ir);
    expect(result.ir.flows[0].moments).toHaveLength(2);
    expect(feature.content).toContain('# moment: Later');
    expect(feature.scenarioCount).toBe(1);
  });
});

describe('GeneratedFeatureFile', () => {
  it('carries exactly the declared keys', async () => {
    const all = features(await loadModel(TICKETWAVE));
    expect(all.length).toBeGreaterThan(0);
    for (const feature of all) {
      expect(Object.keys(feature).sort()).toEqual(
        ['content', 'filePath', 'flowId', 'scenarioCount'].sort(),
      );
    }
  });
});
