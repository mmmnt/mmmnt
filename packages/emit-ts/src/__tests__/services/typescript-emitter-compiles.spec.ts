import { describe, it, expect, beforeAll } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import ts from 'typescript';
import { MomentParser, isDirectory, loadSpecification } from '@mmmnt/core';
import type { IntermediateRepresentation } from '@mmmnt/core';
import { TypeScriptEmitter } from '../../services/typescript-emitter.js';
import type { GenerationScope } from '../../types/index.js';

// The emitted files type-check on their own under `tsc --strict`: every built-in type is written as a
// TypeScript type, and every declared type a file names is declared in it or imported from the file
// that declares it. Each model is emitted into its own directory and all of them are compiled as one
// program, with the module settings a Node.js ESM project uses.

const ROOT = resolve(import.meta.dirname, '../../../../..');
const TICKETWAVE = 'examples/ticketwave/spec/ticketwave.moment';
const FIELD_TYPES = 'fixtures/valid/field-types/field-types.moment';

async function load(path: string): Promise<IntermediateRepresentation | undefined> {
  const full = join(ROOT, path);
  const result = isDirectory(full)
    ? await loadSpecification(full)
    : await new MomentParser().parseContent(readFileSync(full, 'utf8'), full);
  return result.success ? result.ir : undefined;
}

function momentFiles(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((entry) => {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) return momentFiles(path);
      return path.endsWith('.moment') ? [relative(ROOT, path)] : [];
    });
}

/** The diagnostics of one program over every emitted file set, each under its own directory. */
function compile(sets: ReadonlyMap<string, ReadonlyMap<string, string>>): Map<string, string[]> {
  const dir = mkdtempSync(join(tmpdir(), 'emit-ts-compiles-'));
  try {
    writeFileSync(join(dir, 'package.json'), '{ "type": "module" }\n');
    const roots: string[] = [];
    for (const [name, files] of sets) {
      for (const [path, text] of files) {
        const target = join(dir, name, path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, text);
        roots.push(target);
      }
    }
    const program = ts.createProgram(roots, {
      strict: true,
      noEmit: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      types: [],
    });
    const byModel = new Map<string, string[]>([...sets.keys()].map((k) => [k, []]));
    for (const d of ts.getPreEmitDiagnostics(program)) {
      const file = d.file ? relative(dir, d.file.fileName) : '';
      // A diagnostic outside every model (a global one) is kept under its own key.
      const name = [...sets.keys()].find((k) => file.startsWith(`${k}/`)) ?? '(global)';
      const message = `${file}: TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`;
      byModel.set(name, [...(byModel.get(name) ?? []), message]);
    }
    return byModel;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const key = (path: string, scope: GenerationScope): string =>
  `${path.replace(/[^A-Za-z0-9]+/g, '_')}__${scope.level}`;

let diagnostics: Map<string, string[]>;
let emitted: Map<string, ReadonlyMap<string, string>>;
let models: string[];

beforeAll(async () => {
  // Every file under fixtures/valid on its own, and every directory there that loads as one project.
  const directories = readdirSync(join(ROOT, 'fixtures/valid'))
    .sort()
    .map((entry) => `fixtures/valid/${entry}`)
    .filter((path) => isDirectory(join(ROOT, path)));
  const candidates = [TICKETWAVE, ...momentFiles(join(ROOT, 'fixtures/valid')), ...directories];

  emitted = new Map();
  models = [];
  for (const path of candidates) {
    const ir = await load(path);
    if (ir === undefined) {
      // A single file must parse; a directory of standalone files is not one project.
      expect(directories, `${path} does not parse`).toContain(path);
      continue;
    }
    models.push(path);
    for (const scope of [{ level: 'system' }, { level: 'context' }] as GenerationScope[]) {
      const files = new TypeScriptEmitter().emit(ir, { scope }).files;
      if (files.size > 0) emitted.set(key(path, scope), files);
    }
  }
  diagnostics = compile(emitted);
}, 120_000);

describe('the emitted TypeScript compiles under tsc --strict', () => {
  it('TicketWave: no diagnostics, across every context', () => {
    const files = emitted.get(key(TICKETWAVE, { level: 'system' }))!;
    expect(files.size).toBe(40);
    expect(diagnostics.get(key(TICKETWAVE, { level: 'system' }))).toEqual([]);
  });

  it('the field-types fixture: no diagnostics, with its value objects imported from the read model', () => {
    const files = emitted.get(key(FIELD_TYPES, { level: 'system' }))!;
    expect(files.get('src/intake/receipt.types.ts')).toContain("from './read-model.types.js';");
    expect(diagnostics.get(key(FIELD_TYPES, { level: 'system' }))).toEqual([]);
  });

  it('every model in fixtures/valid: no diagnostics, at system and at context scope', () => {
    // The project directories load as one model each, beside every file on its own.
    expect(models).toEqual(
      expect.arrayContaining([
        'fixtures/valid/minimal',
        'fixtures/valid/multi-context',
        'fixtures/valid/process-constructs',
        'fixtures/valid/field-types',
      ]),
    );
    expect(emitted.size).toBeGreaterThanOrEqual(40);
    const failing = [...diagnostics].filter(([, messages]) => messages.length > 0);
    expect(failing).toEqual([]);
  });
});
