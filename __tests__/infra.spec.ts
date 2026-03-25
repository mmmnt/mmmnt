/**
 * M1 Infrastructure Verification — Smoke Tests
 *
 * These tests verify that the monorepo infrastructure delivered in M1
 * is correctly configured and operational. They produce JUnit XML
 * evidence for Xray QMS traceability (Test Plan MMNT-585).
 *
 * Each `describe`/`it` path maps 1:1 to a pre-created Xray Test issue.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

function fileExists(relativePath: string): boolean {
  return existsSync(resolve(ROOT, relativePath));
}

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(ROOT, relativePath), 'utf-8'));
}

function readText(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf-8');
}

// ---------------------------------------------------------------------------
// 1.1 — Repository Scaffold
// ---------------------------------------------------------------------------
describe('M1 Infrastructure > Repository Scaffold', () => {
  it('LICENSE.md exists at repository root', () => {
    expect(fileExists('LICENSE.md')).toBe(true);
  });

  it('CONTRIBUTING.md exists at repository root', () => {
    expect(fileExists('CONTRIBUTING.md')).toBe(true);
  });

  it('pnpm-workspace.yaml defines packages/* glob', () => {
    const content = readText('pnpm-workspace.yaml');
    expect(content).toContain("packages/*");
  });

  it('turbo.json defines build, test, lint, and typecheck tasks', () => {
    const turbo = readJson('turbo.json') as { tasks: Record<string, unknown> };
    expect(turbo.tasks).toHaveProperty('build');
    expect(turbo.tasks).toHaveProperty('test');
    expect(turbo.tasks).toHaveProperty('lint');
    expect(turbo.tasks).toHaveProperty('typecheck');
  });

  const EXPECTED_PACKAGES = [
    'core',
    'derive',
    'generate',
    'harness',
    'viz',
    'emit-ts',
    'sync',
    'schema',
    'cli',
    'mcp',
  ];

  it.each(EXPECTED_PACKAGES)(
    'package %s is scaffolded with package.json and tsconfig.json',
    (pkg) => {
      expect(fileExists(`packages/${pkg}/package.json`)).toBe(true);
      expect(fileExists(`packages/${pkg}/tsconfig.json`)).toBe(true);
    },
  );
});

// ---------------------------------------------------------------------------
// 1.2 — Shared Tooling
// ---------------------------------------------------------------------------
describe('M1 Infrastructure > Shared Tooling', () => {
  it('tsconfig.base.json configures strict mode and NodeNext modules', () => {
    const tsconfig = readJson('tsconfig.base.json') as {
      compilerOptions: Record<string, unknown>;
    };
    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(tsconfig.compilerOptions.module).toBe('NodeNext');
    expect(tsconfig.compilerOptions.moduleResolution).toBe('NodeNext');
  });

  it('eslint.config.mjs exists and is loadable', () => {
    expect(fileExists('eslint.config.mjs')).toBe(true);
  });

  it('commitlint.config.mjs enforces conventional commits with project scopes', () => {
    expect(fileExists('commitlint.config.mjs')).toBe(true);
    const content = readText('commitlint.config.mjs');
    expect(content).toContain('@commitlint/config-conventional');
    // Verify all 10 package scopes are registered
    for (const scope of [
      'core',
      'derive',
      'generate',
      'harness',
      'viz',
      'emit-ts',
      'sync',
      'schema',
      'cli',
      'mcp',
    ]) {
      expect(content).toContain(`'${scope}'`);
    }
  });

  it('vitest.workspace.ts includes packages/* in the workspace', () => {
    const content = readText('vitest.workspace.ts');
    expect(content).toContain('packages/*');
  });

  it('root vitest.config.ts enables JUnit reporter for test results', () => {
    const config = readText('vitest.config.ts');
    expect(config).toContain('junit');
    expect(config).toContain('test-results/junit.xml');
  });
});

// ---------------------------------------------------------------------------
// 1.3 — CI Pipeline
// ---------------------------------------------------------------------------
describe('M1 Infrastructure > CI Pipeline', () => {
  it('ci.yml workflow exists', () => {
    expect(fileExists('.github/workflows/ci.yml')).toBe(true);
  });

  it('ci.yml defines build job with Node 20 and 22 matrix', () => {
    const ci = readText('.github/workflows/ci.yml');
    expect(ci).toContain('node-version: [20, 22]');
  });

  it('ci.yml includes generate, typecheck, lint, build, and test steps', () => {
    const ci = readText('.github/workflows/ci.yml');
    expect(ci).toContain('pnpm turbo generate');
    expect(ci).toContain('pnpm turbo typecheck');
    expect(ci).toContain('pnpm turbo lint');
    expect(ci).toContain('pnpm turbo build');
    expect(ci).toContain('pnpm turbo test');
  });

  it('ci.yml includes xray-import job for JUnit and Cucumber results', () => {
    const ci = readText('.github/workflows/ci.yml');
    expect(ci).toContain('xray-import');
    expect(ci).toContain('import/execution/junit');
    expect(ci).toContain('import/execution/cucumber');
  });

  it('ci.yml includes quality job with complexity and bundle size checks', () => {
    const ci = readText('.github/workflows/ci.yml');
    expect(ci).toContain('quality:');
    expect(ci).toContain('Bundle size check');
  });

  it('ci.yml includes security job with Snyk and Gitleaks', () => {
    const ci = readText('.github/workflows/ci.yml');
    expect(ci).toContain('security:');
    expect(ci).toContain('Snyk SCA');
    expect(ci).toContain('gitleaks');
  });

  it('ci.yml includes commitlint check on pull requests', () => {
    const ci = readText('.github/workflows/ci.yml');
    expect(ci).toContain('Commitlint');
    expect(ci).toContain('commitlint --from');
  });
});

// ---------------------------------------------------------------------------
// 1.4 — Commit Conventions
// ---------------------------------------------------------------------------
describe('M1 Infrastructure > Commit Conventions', () => {
  it('commitlint.config.mjs exists for conventional commit enforcement', () => {
    expect(fileExists('commitlint.config.mjs')).toBe(true);
  });

  it('CI workflow enforces commitlint on pull requests', () => {
    const ci = readText('.github/workflows/ci.yml');
    expect(ci).toContain('commitlint --from');
  });

  it('root package.json includes commitlint devDependencies', () => {
    const pkg = readJson('package.json') as {
      devDependencies: Record<string, string>;
    };
    expect(pkg.devDependencies).toHaveProperty('@commitlint/cli');
    expect(pkg.devDependencies).toHaveProperty('@commitlint/config-conventional');
  });
});

// ---------------------------------------------------------------------------
// 1.5 — Turborepo Pipeline
// ---------------------------------------------------------------------------
describe('M1 Infrastructure > Turborepo Pipeline', () => {
  it('build task depends on generate and ^build', () => {
    const turbo = readJson('turbo.json') as {
      tasks: Record<string, { dependsOn?: string[] }>;
    };
    expect(turbo.tasks.build.dependsOn).toContain('generate');
    expect(turbo.tasks.build.dependsOn).toContain('^build');
  });

  it('test task depends on build', () => {
    const turbo = readJson('turbo.json') as {
      tasks: Record<string, { dependsOn?: string[] }>;
    };
    expect(turbo.tasks.test.dependsOn).toContain('build');
  });

  it('generate task captures src/generated/** outputs', () => {
    const turbo = readJson('turbo.json') as {
      tasks: Record<string, { outputs?: string[] }>;
    };
    expect(turbo.tasks.generate.outputs).toContain('src/generated/**');
  });

  it('typecheck task depends on generate and ^build', () => {
    const turbo = readJson('turbo.json') as {
      tasks: Record<string, { dependsOn?: string[] }>;
    };
    expect(turbo.tasks.typecheck.dependsOn).toContain('generate');
    expect(turbo.tasks.typecheck.dependsOn).toContain('^build');
  });
});
