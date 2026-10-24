import * as fs from 'node:fs';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import * as git from 'isomorphic-git';
import { TypeScriptEmitter } from '@mmmnt/emit-ts';
import { loadSpecification } from '../lib/load-specification.js';

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures/valid/minimal/contexts');

export const TYPES_FILE = 'src/ordering/order.types.ts';

export interface SyncProject {
  readonly dir: string;
  /** The path handed to the sync commands: a .moment file, or the model directory. */
  readonly spec: string;
  readonly domainDir: string;
  read(path: string): string;
  write(path: string, content: string): void;
  /** Add a field to an emitted interface, as a developer editing generated code would. */
  addField(symbol: string, field: string): void;
  restore(path: string): void;
  cleanup(): void;
}

export interface SyncProjectOptions {
  /** Model directory mode: both fixtures under `model/`, loaded as one project. */
  readonly directory?: boolean;
  readonly name?: string;
  readonly email?: string;
}

/** An empty repo whose config carries the identity; an empty string leaves that key unset. */
async function initRepo(dir: string, options: SyncProjectOptions): Promise<void> {
  await git.init({ fs, dir, defaultBranch: 'main' });
  const identity = {
    'user.name': options.name ?? 'Dev',
    'user.email': options.email ?? 'dev@example.com',
  };
  for (const [path, value] of Object.entries(identity)) {
    if (value !== '') await git.setConfig({ fs, dir, path, value });
  }
}

/** Copy the fixtures in; the spec is the single file, or the model directory holding both. */
function writeSpecs(dir: string, directory: boolean): { spec: string; specDir: string } {
  const specDir = directory ? join(dir, 'model') : dir;
  mkdirSync(specDir, { recursive: true });
  for (const name of directory ? ['ordering', 'fulfillment'] : ['ordering']) {
    writeFileSync(
      join(specDir, `${name}.moment`),
      readFileSync(join(FIXTURES, `${name}.moment`), 'utf-8'),
    );
  }
  return { spec: directory ? specDir : join(dir, 'ordering.moment'), specDir };
}

export async function createSyncProject(options: SyncProjectOptions = {}): Promise<SyncProject> {
  const dir = mkdtempSync(join(tmpdir(), 'moment-sync-'));
  await initRepo(dir, options);
  const { spec, specDir } = writeSpecs(dir, options.directory === true);

  const loaded = await loadSpecification(spec);
  const emitted = new TypeScriptEmitter().emit(loaded.ir!, { scope: { level: 'system' } });
  for (const [path, content] of emitted.files) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }

  await git.add({ fs, dir, filepath: '.' });
  await git.commit({
    fs,
    dir,
    message: 'chore: initial',
    author: { name: 'Seed', email: 'seed@example.com' },
  });

  const read = (path: string): string => readFileSync(join(dir, path), 'utf-8');
  const write = (path: string, content: string): void => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  };

  return {
    dir,
    spec,
    domainDir: join(specDir, '.domain'),
    read,
    write,
    addField(symbol, field) {
      const marker = `export interface ${symbol} {\n`;
      const source = read(TYPES_FILE);
      if (!source.includes(marker)) throw new Error(`No interface ${symbol} in ${TYPES_FILE}`);
      write(TYPES_FILE, source.replace(marker, `${marker}  readonly ${field};\n`));
    },
    restore(path) {
      const content = emitted.files.get(path);
      if (content === undefined) throw new Error(`Nothing emitted at ${path}`);
      write(path, content);
    },
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
