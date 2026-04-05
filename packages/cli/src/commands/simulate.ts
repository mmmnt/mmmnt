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

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
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

    // Write topology for this flow
    const topology = topoEmitter.emit(ir, group.flow);
    const topologyFile = `topology-${flowSlug}.json`;
    writeFileSync(
      join(resolvedDir, topologyFile),
      JSON.stringify(topology, null, 2) + '\n',
      'utf-8',
    );

    // Write each scenario
    const manifestScenarios: ManifestScenario[] = [];
    for (const scenario of group.scenarios) {
      const fileName = `${scenario.scenarioId}.json`;
      writeFileSync(join(resolvedDir, fileName), JSON.stringify(scenario, null, 2) + '\n', 'utf-8');
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

  const manifest = { flows: manifestFlows, artifacts };
  writeFileSync(
    join(resolvedDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf-8',
  );

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
  writeFileSync(join(outDir, files.eventCatalog), JSON.stringify(catalog, null, 2) + '\n', 'utf-8');

  const impact = generateImpactAnalysis(ir);
  files.impactAnalysis = 'impact-analysis.json';
  writeFileSync(
    join(outDir, files.impactAnalysis),
    JSON.stringify(impact, null, 2) + '\n',
    'utf-8',
  );

  const sagas = generateSagaStateMachines(ir);
  files.sagaStateMachines = 'saga-state-machines.json';
  writeFileSync(
    join(outDir, files.sagaStateMachines),
    JSON.stringify(sagas, null, 2) + '\n',
    'utf-8',
  );

  const asyncapi = generateAsyncApiSpec(ir);
  files.asyncApi = 'asyncapi.yaml';
  writeFileSync(join(outDir, files.asyncApi), asyncapi, 'utf-8');

  return files;
}

function kebab(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
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
  const parseResult = await parser.parseContent(content);

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
    const groups: FlowScenarioGroup[] = targetFlows.map((flow) => ({
      flow,
      scenarios: values.all
        ? [...generateAllScenarios(ir, flow), ...deriveNegativeScenarios(ir, flow)]
        : [generateSimulationScenario(ir, flow)],
    }));
    return writeOutputFiles(groups, ir, outDir);
  }

  const scenarios: SimulationScenario[] = values.all
    ? targetFlows.flatMap((flow) => [
        ...generateAllScenarios(ir, flow),
        ...deriveNegativeScenarios(ir, flow),
      ])
    : targetFlows.map((flow) => generateSimulationScenario(ir, flow));

  return formatScenarios(scenarios, values.json === true);
}
