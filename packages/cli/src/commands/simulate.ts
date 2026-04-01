/**
 * moment simulate — Generate Facet-compatible simulation scenario from .moment spec
 *
 * Produces a JSON scenario with synthetic events, causation chains,
 * expected paths, and branch selections for each flow in the spec.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { MomentParser } from '@mmmnt/core';
import { generateSimulationScenario } from '@mmmnt/derive';
import type { Diagnostic } from '@mmmnt/core';
import type { SimulationScenario } from '@mmmnt/derive';
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

export async function runSimulate(argv: string[]): Promise<SimulateCommandResult> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { json: { type: 'boolean' }, flow: { type: 'string' } },
    allowPositionals: true,
    strict: false,
  });

  const filePath = positionals[0];
  if (!filePath) return fail('Usage: moment simulate <file.moment> [--json] [--flow <name>]');

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

  const scenarios = targetFlows.map((flow) => generateSimulationScenario(ir, flow));
  return formatScenarios(scenarios, values.json === true);
}
