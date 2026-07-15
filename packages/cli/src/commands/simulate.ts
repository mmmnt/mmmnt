/**
 * moment simulate — Generate Facet-compatible simulation scenarios from .moment spec
 *
 * Produces JSON scenarios with synthetic events, causation chains,
 * expected paths, and branch selections for each flow in the spec.
 *
 * --all: generate all branch combinations + negative (precondition) scenarios
 * --out-dir <path>: write per-flow topology + per-scenario files + manifest.json
 * --json: output to stdout as JSON (single file, all scenarios)
 * --flow <name>: filter to a specific flow
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { MomentParser } from '@mmmnt/core';
import type { IntermediateRepresentation, FlowDefinition, Diagnostic } from '@mmmnt/core';
import {
  generateSimulationScenario,
  generateAllScenarios,
  deriveNegativeScenarios,
  TopologyEmitter,
  generateEventCatalog,
  generateImpactAnalysis,
  generateSagaStateMachines,
} from '@mmmnt/derive';
import type { SimulationScenario } from '@mmmnt/derive';
import { generateAsyncApiSpec } from '@mmmnt/generate';
import { updateManifestFromIr } from './update-manifest.js';
import { assertPathWithin } from './project-fs.js';

export interface SimulateCommandResult {
  readonly success: boolean;
  readonly message: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly filePath?: string;
  readonly scenarios?: readonly SimulationScenario[];
  readonly json?: string;
}

const EMPTY: readonly Diagnostic[] = [];

function fail(message: string): SimulateCommandResult {
  return { success: false, message, diagnostics: EMPTY };
}

function readMomentFile(filePath: string): string | SimulateCommandResult {
  const resolvedPath = resolve(filePath);
  if (!existsSync(resolvedPath)) return fail(`Error: File not found: ${resolvedPath}`);
  try {
    return readFileSync(resolvedPath, 'utf-8');
  } catch (err: unknown) {
    return fail(
      `Error: Failed to read ${resolvedPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function formatScenarios(
  scenarios: readonly SimulationScenario[],
  asJson: boolean,
): SimulateCommandResult {
  const totalEvents = scenarios.reduce((sum, s) => sum + s.events.length, 0);

  if (asJson) {
    const output =
      scenarios.length === 1
        ? JSON.stringify(scenarios[0], null, 2)
        : JSON.stringify(scenarios, null, 2);
    return { success: true, message: output, diagnostics: EMPTY, scenarios, json: output };
  }

  const lines = scenarios.map(
    (s) =>
      `Scenario: ${s.scenarioLabel}\n  Path: ${s.expectedPath.length} nodes\n  Events: ${s.events.length}\n  Branches: ${s.activeBranches.length}`,
  );

  return {
    success: true,
    message: `Generated ${scenarios.length} simulation scenario(s), ${totalEvents} events\n\n${lines.join('\n\n')}`,
    diagnostics: EMPTY,
    scenarios,
  };
}

// ---------------------------------------------------------------------------
// --out-dir: write topology + scenarios + manifest grouped by flow
// ---------------------------------------------------------------------------

interface FlowScenarioGroup {
  flow: FlowDefinition;
  scenarios: SimulationScenario[];
}

interface ManifestFlow {
  flowId: string;
  flowName: string;
  topology: string;
  scenarios: ManifestScenario[];
}

interface ManifestScenario {
  scenarioId: string;
  scenarioLabel: string;
  description: string;
  file: string;
  eventCount: number;
  pathLength: number;
  branchCount: number;
  isHappyPath: boolean;
  isNegative: boolean;
}

/**
 * Write a file into `baseDir`, guarding against path traversal.
 *
 * The filename may include user-controlled substrings. Concretely, scenario
 * files are written as `${scenario.scenarioId}.json` where `scenarioId` is
 * built by the derive package as `scenario-${flow.id}` and `flow.id` is
 * `flow-${flow.name}`. `flow.name` is a langium STRING with no character
 * restrictions, so a `.moment` file declaring `flow "../../etc/evil"`
 * produces a filename containing `../` segments that `path.join` would
 * normalize through, escaping `baseDir`. `assertPathWithin` rejects any
 * resolved target that falls outside the directory using a path-separator
 * boundary check (so `/base-sibling` can't masquerade as inside `/base`).
 */
function writeSafe(baseDir: string, filename: string, content: string): void {
  const fullPath = join(baseDir, filename);
  assertPathWithin(fullPath, baseDir);
  writeFileSync(fullPath, content, 'utf-8');
}

function writeOutputFiles(
  groups: FlowScenarioGroup[],
  ir: IntermediateRepresentation,
  outDir: string,
): SimulateCommandResult {
  const resolvedDir = resolve(outDir);
  mkdirSync(resolvedDir, { recursive: true });

  const topoEmitter = new TopologyEmitter();
  const manifestFlows: ManifestFlow[] = [];
  let totalScenarios = 0;
  let totalEvents = 0;

  for (const group of groups) {
    const flowSlug = kebab(group.flow.name);

    // Write topology for this flow. flowSlug is kebab-sanitized so traversal
    // is impossible here, but writeSafe is used uniformly for consistency.
    const topology = topoEmitter.emit(ir, group.flow);
    const topologyFile = `topology-${flowSlug}.json`;
    writeSafe(resolvedDir, topologyFile, JSON.stringify(topology, null, 2) + '\n');

    // Write each scenario. scenarioId is NOT kebab-sanitized and may contain
    // raw user content via flow.name → flow.id → `scenario-${flow.id}`, so
    // writeSafe's path-traversal guard is load-bearing here.
    const manifestScenarios: ManifestScenario[] = [];
    for (const scenario of group.scenarios) {
      const fileName = `${scenario.scenarioId}.json`;
      writeSafe(resolvedDir, fileName, JSON.stringify(scenario, null, 2) + '\n');
      totalScenarios++;
      totalEvents += scenario.events.length;

      manifestScenarios.push({
        scenarioId: scenario.scenarioId,
        scenarioLabel: scenario.scenarioLabel,
        description: scenario.description,
        file: fileName,
        eventCount: scenario.events.length,
        pathLength: scenario.expectedPath.length,
        branchCount: scenario.activeBranches.length,
        isHappyPath: scenario.scenarioLabel.startsWith('Happy Path:'),
        isNegative: scenario.scenarioLabel.startsWith('Failure:'),
      });
    }

    manifestFlows.push({
      flowId: group.flow.id,
      flowName: group.flow.name,
      topology: topologyFile,
      scenarios: manifestScenarios,
    });
  }

  // Write spec-level artifacts (ADR-029 §3)
  const artifacts = writeArtifacts(ir, resolvedDir);

  // Manifest filename is hardcoded, so path traversal is impossible, but
  // keep writeSafe uniform so future refactors don't accidentally introduce
  // a writeFileSync that forgets the guard.
  const manifest = { flows: manifestFlows, artifacts };
  writeSafe(resolvedDir, 'manifest.json', JSON.stringify(manifest, null, 2) + '\n');

  return {
    success: true,
    message: `Wrote ${groups.length} topology file(s), ${totalScenarios} scenario file(s), ${Object.keys(artifacts).length} artifact(s), manifest.json to ${resolvedDir} (${totalEvents} total events)`,
    diagnostics: EMPTY,
  };
}

function writeArtifacts(ir: IntermediateRepresentation, outDir: string): Record<string, string> {
  const files: Record<string, string> = {};

  const catalog = generateEventCatalog(ir);
  files.eventCatalog = 'event-catalog.json';
  writeSafe(outDir, files.eventCatalog, JSON.stringify(catalog, null, 2) + '\n');

  const impact = generateImpactAnalysis(ir);
  files.impactAnalysis = 'impact-analysis.json';
  writeSafe(outDir, files.impactAnalysis, JSON.stringify(impact, null, 2) + '\n');

  const sagas = generateSagaStateMachines(ir);
  files.sagaStateMachines = 'saga-state-machines.json';
  writeSafe(outDir, files.sagaStateMachines, JSON.stringify(sagas, null, 2) + '\n');

  const asyncapi = generateAsyncApiSpec(ir);
  files.asyncApi = 'asyncapi.yaml';
  writeSafe(outDir, files.asyncApi, asyncapi);

  return files;
}

function kebab(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Run simulate in --out-dir mode. Builds the scenario groups and delegates
 * to writeOutputFiles, catching any path-traversal error from assertPathWithin
 * so the CLI returns a structured failure instead of crashing with an
 * unhandled stack trace.
 */
function runOutDirWrite(
  flows: FlowDefinition[],
  ir: IntermediateRepresentation,
  outDir: string,
  includeAll: boolean,
): SimulateCommandResult {
  const groups: FlowScenarioGroup[] = flows.map((flow) => ({
    flow,
    scenarios: includeAll
      ? [...generateAllScenarios(ir, flow), ...deriveNegativeScenarios(ir, flow)]
      : [generateSimulationScenario(ir, flow)],
  }));

  try {
    return writeOutputFiles(groups, ir, outDir);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(msg);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function runSimulate(argv: string[]): Promise<SimulateCommandResult> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      json: { type: 'boolean' },
      flow: { type: 'string' },
      all: { type: 'boolean' },
      'out-dir': { type: 'string' },
    },
    allowPositionals: true,
    strict: false,
  });

  const filePath = positionals[0];
  if (!filePath)
    return fail(
      'Usage: moment simulate <file.moment> [--json] [--flow <name>] [--all] [--out-dir <path>]',
    );

  const content = readMomentFile(filePath);
  if (typeof content !== 'string') return content;

  const parser = new MomentParser();
  const parseResult = await parser.parseContent(content, resolve(filePath));

  if (!parseResult.success) {
    return {
      success: false,
      message: `Parse failed with ${parseResult.diagnostics.length} diagnostic(s)`,
      diagnostics: parseResult.diagnostics,
      filePath: resolve(filePath),
    };
  }

  const ir = parseResult.ir!;
  updateManifestFromIr(resolve(filePath), ir);

  if (ir.flows.length === 0) {
    return fail('No flows found. Simulation requires at least one flow.');
  }

  const targetFlows = values.flow ? ir.flows.filter((f) => f.name === values.flow) : ir.flows;

  if (targetFlows.length === 0) {
    return fail(`Flow '${values.flow}' not found.`);
  }

  const outDir = values['out-dir'];

  if (outDir) {
    return runOutDirWrite(targetFlows, ir, outDir, values.all === true);
  }

  const scenarios: SimulationScenario[] = values.all
    ? targetFlows.flatMap((flow) => [
        ...generateAllScenarios(ir, flow),
        ...deriveNegativeScenarios(ir, flow),
      ])
    : targetFlows.map((flow) => generateSimulationScenario(ir, flow));

  return formatScenarios(scenarios, values.json === true);
}
