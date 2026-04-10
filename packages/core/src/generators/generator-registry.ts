/**
 * GeneratorRegistry — open registry replacing the hardcoded ALLOWED_FORMATS.
 *
 * Per ADR-032 R1 and ADR-034 G3: @mmmnt/core exports the interface +
 * registry class. Each generator package exports a registerGenerators()
 * function that populates the registry. The CLI's project-mode bootstrap
 * calls all of them. No circular dependencies.
 */

import type { GeneratorDescriptor } from './generator-descriptor.js';

export class GeneratorRegistry {
  private readonly descriptors = new Map<string, GeneratorDescriptor>();

  /** Register a generator descriptor. Throws if format is already registered. */
  register(descriptor: GeneratorDescriptor): void {
    if (this.descriptors.has(descriptor.format)) {
      throw new Error(`Generator format '${descriptor.format}' is already registered.`);
    }
    this.descriptors.set(descriptor.format, descriptor);
  }

  /** Resolve a descriptor by format name. Throws with available formats if unknown. */
  resolve(format: string): GeneratorDescriptor {
    const descriptor = this.descriptors.get(format);
    if (!descriptor) {
      const available = [...this.descriptors.keys()].sort().join(', ');
      throw new Error(
        `Unknown generator format '${format}'. Registered formats: ${available || '(none)'}`,
      );
    }
    return descriptor;
  }

  /** Check if a format is registered. */
  has(format: string): boolean {
    return this.descriptors.has(format);
  }

  /** Get all registered descriptors. */
  getAll(): readonly GeneratorDescriptor[] {
    return [...this.descriptors.values()];
  }

  /** Get all registered format names. */
  getFormats(): readonly string[] {
    return [...this.descriptors.keys()].sort();
  }

  /**
   * Compute a topologically sorted execution order from the dependency
   * graph declared via dependsOn. Throws on cycles.
   *
   * Returns format names in an order where every dependency appears
   * before its dependent. Independent generators appear in alphabetical
   * order for determinism.
   */
  planExecutionOrder(requestedFormats?: readonly string[]): string[] {
    const formats = requestedFormats ? [...requestedFormats] : [...this.descriptors.keys()];

    // Build adjacency list from dependsOn edges.
    const graph = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    for (const format of formats) {
      if (!graph.has(format)) graph.set(format, []);
      if (!inDegree.has(format)) inDegree.set(format, 0);
    }

    for (const format of formats) {
      const descriptor = this.descriptors.get(format);
      if (!descriptor) continue;
      for (const dep of descriptor.dependsOn) {
        if (!formats.includes(dep)) continue;
        addEdge(graph, inDegree, dep, format);
      }
    }

    return topologicalSort(formats, graph, inDegree);
  }
}

/** Add a directed edge dep → dependent in the adjacency list. */
function addEdge(
  graph: Map<string, string[]>,
  inDegree: Map<string, number>,
  from: string,
  to: string,
): void {
  if (!graph.has(from)) graph.set(from, []);
  graph.get(from)!.push(to);
  inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
}

/**
 * Kahn's algorithm for topological sort. Throws on cycles with a
 * diagnostic identifying the participants.
 */
function topologicalSort(
  allNodes: string[],
  graph: Map<string, string[]>,
  inDegree: Map<string, number>,
): string[] {
  // Start with nodes that have no incoming edges, sorted for determinism.
  const queue = allNodes.filter((n) => (inDegree.get(n) ?? 0) === 0).sort();

  const result: string[] = [];

  while (queue.length > 0) {
    // Sort queue each iteration to ensure deterministic ordering
    // among nodes at the same depth level.
    queue.sort();
    const node = queue.shift()!;
    result.push(node);

    for (const neighbor of graph.get(node) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  if (result.length !== allNodes.length) {
    const cycleParticipants = allNodes
      .filter((n) => !result.includes(n))
      .sort()
      .join(', ');
    throw new Error(
      `Dependency cycle detected among generators: ${cycleParticipants}. ` +
        `Check the dependsOn declarations for these formats.`,
    );
  }

  return result;
}
