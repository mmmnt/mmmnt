/**
 * MMNT-25 Langium Pipeline — Verification Tests
 *
 * These tests verify that Langium is correctly wired into the
 * @mmmnt/core build pipeline. They produce JUnit XML evidence
 * for Xray QMS traceability (Test Plan MMNT-586).
 *
 * Xray Test issues: MMNT-652, MMNT-653, MMNT-654, MMNT-655
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CORE = resolve(import.meta.dirname, '..');
const ROOT = resolve(CORE, '../..');

function fileExists(relativePath: string): boolean {
  return existsSync(resolve(CORE, relativePath));
}

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(CORE, relativePath), 'utf-8'));
}

function readRootJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(ROOT, relativePath), 'utf-8'));
}

function readRootText(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf-8');
}

// ---------------------------------------------------------------------------
// MMNT-652 — Structural Configuration
// ---------------------------------------------------------------------------
describe('MMNT-25 Langium Pipeline > Structural Configuration', () => {
  it('langium-config.json exists with correct project configuration', () => {
    expect(fileExists('langium-config.json')).toBe(true);

    const config = readJson('langium-config.json') as {
      projectName: string;
      languages: Array<{
        id: string;
        grammar: string;
        fileExtensions: string[];
      }>;
      out: string;
    };

    expect(config.projectName).toBe('Moment');
    expect(config.languages).toHaveLength(1);
    expect(config.languages[0].id).toBe('moment');
    expect(config.languages[0].grammar).toBe('src/grammar/moment.langium');
    expect(config.languages[0].fileExtensions).toContain('.moment');
  });

  it('src/grammar directory exists', () => {
    expect(fileExists('src/grammar')).toBe(true);
  });

  it('package.json includes langium in dependencies and langium-cli in devDependencies', () => {
    const pkg = readJson('package.json') as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };

    // langium is imported by runtime source (parser, validator, generated code),
    // so it must be a runtime dependency — not a devDependency.
    expect(pkg.dependencies).toHaveProperty('langium');
    // langium-cli is only used at build time to generate the parser.
    expect(pkg.devDependencies).toHaveProperty('langium-cli');
  });
});

// ---------------------------------------------------------------------------
// MMNT-653 — Contract Compliance
// ---------------------------------------------------------------------------
describe('MMNT-25 Langium Pipeline > Contract Compliance', () => {
  it('langium-config.json out field points to src/generated', () => {
    const config = readJson('langium-config.json') as { out: string };
    expect(config.out).toBe('src/generated');
  });

  it('grammar file exists for grammar file delivery', () => {
    // Grammar file now exists (delivered by MMNT-26).
    // MMNT-25 created the directory structure, MMNT-26 delivered the grammar.
    expect(fileExists('src/grammar/moment.langium')).toBe(true);
  });

  it('src/generated is excluded from prettier and coverage', () => {
    const prettierIgnore = readRootText('.prettierignore');
    expect(prettierIgnore).toContain('src/generated/');

    const vitestConfig = readFileSync(resolve(CORE, 'vitest.config.ts'), 'utf-8');
    expect(vitestConfig).toContain("'src/generated/**'");
  });
});

// ---------------------------------------------------------------------------
// MMNT-654 — Version Pinning
// ---------------------------------------------------------------------------
describe('MMNT-25 Langium Pipeline > Version Pinning', () => {
  it('langium version is pinned (exact, not range)', () => {
    const pkg = readJson('package.json') as {
      dependencies: Record<string, string>;
    };
    const version = pkg.dependencies['langium'];
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('langium-cli version is pinned (exact, not range)', () => {
    const pkg = readJson('package.json') as {
      devDependencies: Record<string, string>;
    };
    const version = pkg.devDependencies['langium-cli'];
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

// ---------------------------------------------------------------------------
// MMNT-655 — Pipeline Integration
// ---------------------------------------------------------------------------
describe('MMNT-25 Langium Pipeline > Pipeline Integration', () => {
  it('generate script is defined in package.json', () => {
    const pkg = readJson('package.json') as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts).toHaveProperty('generate');
    expect(pkg.scripts.generate).toContain('langium generate');
  });

  it('turbo.json generate task inputs include src/grammar/**/*.langium', () => {
    const turbo = readRootJson('turbo.json') as {
      tasks: Record<string, { inputs?: string[] }>;
    };
    expect(turbo.tasks.generate.inputs).toContain('src/grammar/**/*.langium');
  });

  it('turbo.json generate task outputs include src/generated/**', () => {
    const turbo = readRootJson('turbo.json') as {
      tasks: Record<string, { outputs?: string[] }>;
    };
    expect(turbo.tasks.generate.outputs).toContain('src/generated/**');
  });
});
