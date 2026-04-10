import { describe, it, expect, beforeEach } from 'vitest';
import { GeneratorRegistry } from '../../src/generators/index.js';
import type { GeneratorDescriptor, GeneratorRunResult } from '../../src/generators/index.js';

function makeDescriptor(
  format: string,
  overrides: Partial<GeneratorDescriptor> = {},
): GeneratorDescriptor {
  return {
    format,
    scope: 'project',
    dependsOn: [],
    defaultOutputDir: `generated/${format}`,
    run: async () => ({ files: new Map(), diagnostics: [] }),
    ...overrides,
  };
}

describe('GeneratorRegistry', () => {
  let registry: GeneratorRegistry;

  beforeEach(() => {
    registry = new GeneratorRegistry();
  });

  describe('register/resolve', () => {
    it('registers and resolves a descriptor', () => {
      const desc = makeDescriptor('typescript');
      registry.register(desc);

      expect(registry.resolve('typescript')).toBe(desc);
    });

    it('throws on duplicate registration', () => {
      registry.register(makeDescriptor('typescript'));
      expect(() => registry.register(makeDescriptor('typescript'))).toThrow(/already registered/);
    });

    it('throws on unknown format listing all registered', () => {
      registry.register(makeDescriptor('gherkin'));
      registry.register(makeDescriptor('typescript'));

      expect(() => registry.resolve('unknown')).toThrow(
        /Unknown generator format 'unknown'.*gherkin, typescript/,
      );
    });

    it('throws with (none) when registry is empty', () => {
      expect(() => registry.resolve('anything')).toThrow(/\(none\)/);
    });
  });

  describe('has', () => {
    it('returns true for registered formats', () => {
      registry.register(makeDescriptor('typescript'));
      expect(registry.has('typescript')).toBe(true);
    });

    it('returns false for unknown formats', () => {
      expect(registry.has('unknown')).toBe(false);
    });
  });

  describe('getAll / getFormats', () => {
    it('returns all registered descriptors', () => {
      registry.register(makeDescriptor('a'));
      registry.register(makeDescriptor('b'));

      expect(registry.getAll()).toHaveLength(2);
    });

    it('returns sorted format names', () => {
      registry.register(makeDescriptor('zebra'));
      registry.register(makeDescriptor('alpha'));

      expect(registry.getFormats()).toEqual(['alpha', 'zebra']);
    });
  });

  describe('planExecutionOrder', () => {
    it('returns topologically sorted array respecting dependencies', () => {
      // topology has no deps, test-scaffold depends on topology
      registry.register(makeDescriptor('topology'));
      registry.register(makeDescriptor('test-scaffold', { dependsOn: ['topology'] }));

      const order = registry.planExecutionOrder();
      expect(order.indexOf('topology')).toBeLessThan(order.indexOf('test-scaffold'));
    });

    it('handles a diamond dependency graph', () => {
      // A → B, A → C, B → D, C → D
      registry.register(makeDescriptor('A'));
      registry.register(makeDescriptor('B', { dependsOn: ['A'] }));
      registry.register(makeDescriptor('C', { dependsOn: ['A'] }));
      registry.register(makeDescriptor('D', { dependsOn: ['B', 'C'] }));

      const order = registry.planExecutionOrder();
      expect(order[0]).toBe('A');
      expect(order[order.length - 1]).toBe('D');
      expect(order.indexOf('B')).toBeLessThan(order.indexOf('D'));
      expect(order.indexOf('C')).toBeLessThan(order.indexOf('D'));
    });

    it('detects dependency cycles', () => {
      registry.register(makeDescriptor('A', { dependsOn: ['B'] }));
      registry.register(makeDescriptor('B', { dependsOn: ['A'] }));

      expect(() => registry.planExecutionOrder()).toThrow(/Dependency cycle detected.*A, B/);
    });

    it('handles no dependencies (alphabetical order)', () => {
      registry.register(makeDescriptor('zebra'));
      registry.register(makeDescriptor('alpha'));
      registry.register(makeDescriptor('middle'));

      const order = registry.planExecutionOrder();
      expect(order).toEqual(['alpha', 'middle', 'zebra']);
    });

    it('plans only requested formats when specified', () => {
      registry.register(makeDescriptor('topology'));
      registry.register(makeDescriptor('test-scaffold', { dependsOn: ['topology'] }));
      registry.register(makeDescriptor('gherkin'));

      const order = registry.planExecutionOrder(['topology', 'test-scaffold']);
      expect(order).toEqual(['topology', 'test-scaffold']);
      expect(order).not.toContain('gherkin');
    });

    it('ignores dependencies on formats not in the requested set', () => {
      registry.register(makeDescriptor('topology'));
      registry.register(makeDescriptor('test-scaffold', { dependsOn: ['topology'] }));

      // Request only test-scaffold without topology — dep is ignored
      const order = registry.planExecutionOrder(['test-scaffold']);
      expect(order).toEqual(['test-scaffold']);
    });

    it('handles a single node with self-dependency as a cycle', () => {
      registry.register(makeDescriptor('self-ref', { dependsOn: ['self-ref'] }));
      expect(() => registry.planExecutionOrder()).toThrow(/Dependency cycle/);
    });

    it('deduplicates requested formats', () => {
      registry.register(makeDescriptor('topology'));
      registry.register(makeDescriptor('test-scaffold', { dependsOn: ['topology'] }));

      const order = registry.planExecutionOrder(['topology', 'topology', 'test-scaffold']);
      expect(order).toEqual(['topology', 'test-scaffold']);
    });

    it('handles duplicate dependsOn entries without double-counting', () => {
      registry.register(makeDescriptor('topology'));
      registry.register(makeDescriptor('test-scaffold', { dependsOn: ['topology', 'topology'] }));

      const order = registry.planExecutionOrder();
      expect(order).toEqual(['topology', 'test-scaffold']);
    });

    it('handles formats not in registry gracefully in requested set', () => {
      registry.register(makeDescriptor('topology'));
      // Request a format that's registered + one that isn't
      const order = registry.planExecutionOrder(['topology', 'ghost']);
      // ghost has no descriptor so no edges — still appears in output
      expect(order).toContain('topology');
      expect(order).toContain('ghost');
    });

    it('handles the full R1 dependency graph without cycles', () => {
      // Register all 13 V1 formats with their declared dependencies
      registry.register(makeDescriptor('typescript', { scope: 'project' }));
      registry.register(
        makeDescriptor('test-scaffold', {
          scope: 'flow',
          dependsOn: ['topology'],
        }),
      );
      registry.register(makeDescriptor('gherkin', { scope: 'flow' }));
      registry.register(
        makeDescriptor('cucumber-json', {
          scope: 'flow',
          dependsOn: ['gherkin'],
        }),
      );
      registry.register(makeDescriptor('markdown', { scope: 'project' }));
      registry.register(
        makeDescriptor('asyncapi', {
          scope: 'project',
          dependsOn: ['event-catalog'],
        }),
      );
      registry.register(makeDescriptor('topology', { scope: 'flow' }));
      registry.register(makeDescriptor('event-catalog', { scope: 'project' }));
      registry.register(makeDescriptor('saga', { scope: 'flow', dependsOn: ['topology'] }));
      registry.register(
        makeDescriptor('impact-analysis', {
          scope: 'project',
          dependsOn: ['topology', 'event-catalog'],
        }),
      );
      registry.register(
        makeDescriptor('simulation', {
          scope: 'flow',
          dependsOn: ['topology'],
        }),
      );
      registry.register(makeDescriptor('facet', { scope: 'flow', dependsOn: ['topology'] }));
      registry.register(makeDescriptor('viz', { scope: 'project' }));

      const order = registry.planExecutionOrder();
      expect(order).toHaveLength(13);

      // Verify key ordering constraints
      expect(order.indexOf('topology')).toBeLessThan(order.indexOf('test-scaffold'));
      expect(order.indexOf('topology')).toBeLessThan(order.indexOf('facet'));
      expect(order.indexOf('gherkin')).toBeLessThan(order.indexOf('cucumber-json'));
      expect(order.indexOf('event-catalog')).toBeLessThan(order.indexOf('asyncapi'));
      expect(order.indexOf('event-catalog')).toBeLessThan(order.indexOf('impact-analysis'));
      expect(order.indexOf('topology')).toBeLessThan(order.indexOf('impact-analysis'));
    });
  });
});
