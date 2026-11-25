/**
 * Every generated `.feature` file is valid Gherkin to the Cucumber parser, read as written: no line is
 * dropped or rewritten before parsing. The models are TicketWave, every valid fixture, and a scratch flow
 * with a `returns-to` arm, so every line kind the renderer writes is parsed: tags, Rule, Background, notes,
 * sagas, crossings with their contract table, events with their payload table, `(optional)`, `(outcome)`,
 * `(terminal)`, "the flow ends at" and "the flow returns to".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AstBuilder, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';
import { IdGenerator, type GherkinDocument, type Step } from '@cucumber/messages';
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

/** Parses the feature text exactly as generated. The parser throws on the first invalid line. */
function parse(content: string): GherkinDocument {
  const parser = new Parser(new AstBuilder(IdGenerator.uuid()), new GherkinClassicTokenMatcher());
  return parser.parse(content);
}

/** Every step of the document, in the feature, its rules, their backgrounds and scenarios. */
function steps(doc: GherkinDocument): Step[] {
  const children = doc.feature?.children ?? [];
  return children.flatMap((child) => [
    ...(child.background?.steps ?? []),
    ...(child.scenario?.steps ?? []),
    ...(child.rule?.children ?? []).flatMap((c) => [
      ...(c.background?.steps ?? []),
      ...(c.scenario?.steps ?? []),
    ]),
  ]);
}

const MODELS = [
  TICKETWAVE,
  ...readdirSync(FIXTURES)
    .sort()
    .map((entry) => join(FIXTURES, entry))
    .filter((path) => momentFiles(path).length > 0),
];

// A flow in TicketWave's idiom whose `go` arm returns to an earlier moment.
const RETURNING = `
flow "returning"
  lane inventory "Inventory" [Core]
  lane checkout "Checkout" [Core]

  moment "Start"
    inventory: RequestHold
    inventory: SeatsHeld
    checkout: CreateCart
      triggered-by SeatsHeld
    checkout: CartCreated

  moment "Decision" [branch]
    checkout: AddTicketsToCart
      triggered-by CartCreated
    checkout: TicketsAddedToCart
    when go
      checkout: ConfirmPayment
        returns-to "Start"
    when stop
      checkout: ConfirmPayment
`;

describe('generated features are valid Gherkin', () => {
  it.each(MODELS.map((path) => [path.slice(ROOT.length + 1), path]))(
    '%s: every feature parses as written',
    async (_name, path) => {
      for (const feature of features(await loadModel(path))) {
        expect(() => parse(feature.content), feature.filePath).not.toThrow();
      }
    },
  );

  it('parses a flow that returns to an earlier moment', async () => {
    const source = readFileSync(join(TICKETWAVE, 'ticketwave.moment'), 'utf-8') + RETURNING;
    const result = await new MomentParser().parseContent(source);
    if (!result.ir) throw new Error(result.diagnostics.map((d) => d.message).join('; '));
    const feature = features(result.ir).find((f) => f.content.includes('Feature: returning'));
    expect(feature?.content).toContain('Then the flow returns to "Start"');
    expect(() => parse(feature!.content)).not.toThrow();
  });

  it('gives an emits step its payload as a data table of field names and types', async () => {
    const all = features(await loadModel(TICKETWAVE));
    const n5 = all.find((f) => f.filePath === 'features/n5-seat-request.feature');
    const step = steps(parse(n5!.content)).find((s) => s.text === 'Inventory emits SeatsHeld');
    const rows = step?.dataTable?.rows.map((row) => row.cells.map((cell) => cell.value));
    expect(rows?.[0]).toEqual([
      'holdId',
      'eventId',
      'tierId',
      'sectionId',
      'quantity',
      'customerId',
      'sessionId',
      'expiresAt',
      'heldAt',
    ]);
    expect(rows).toHaveLength(2);
    expect(rows?.[1][0]).toBe('UUID');
  });

  it('marks a list field with [] in the types row', async () => {
    const all = features(await loadModel(join(FIXTURES, 'field-types')));
    const step = all
      .flatMap((f) => steps(parse(f.content)))
      .find((s) => s.text === 'Intake emits ReplayCompleted');
    const [names, types] = step!.dataTable!.rows.map((row) => row.cells.map((cell) => cell.value));
    expect(types[names.indexOf('hashes')]).toBe('ContentHash[]');
  });
});
