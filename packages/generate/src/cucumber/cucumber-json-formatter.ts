/**
 * CucumberJsonFormatter — Converts Gherkin generation results + test topology
 * into Cucumber JSON format for Xray import.
 *
 * Xray expects the standard Cucumber JSON schema:
 * https://github.com/cucumber/cucumber-json-schema
 *
 * This formatter bridges Moment's generated .feature files and derived test
 * results into the format Xray's import/execution/cucumber endpoint consumes.
 */

import type { IntermediateRepresentation, FlowDefinition } from '@mmmnt/core';
import type { TestSuiteTopology } from '@mmmnt/derive';
import type { GenerationManifest } from '../types/index.js';

export interface CucumberFeature {
  readonly keyword: string;
  readonly name: string;
  readonly description: string;
  readonly id: string;
  readonly uri: string;
  readonly tags: readonly CucumberTag[];
  readonly elements: readonly CucumberScenario[];
}

export interface CucumberScenario {
  readonly keyword: string;
  readonly name: string;
  readonly description: string;
  readonly id: string;
  readonly type: 'scenario';
  readonly tags: readonly CucumberTag[];
  readonly steps: readonly CucumberStep[];
}

export interface CucumberStep {
  readonly keyword: string;
  readonly name: string;
  readonly line: number;
  readonly result: CucumberStepResult;
}

export interface CucumberStepResult {
  readonly status: 'passed' | 'failed' | 'pending' | 'skipped' | 'undefined';
  readonly duration: number;
}

export interface CucumberTag {
  readonly name: string;
}

/**
 * Generates Cucumber JSON from Moment's Gherkin features and test topology.
 *
 * Each generated .feature file becomes a CucumberFeature entry. Scenarios are
 * extracted by parsing the feature content. Nothing is executed at generation
 * time, so no step may claim a green run: steps backed by a derived test case
 * are 'pending' (they exist but have not been run), everything else is
 * 'skipped'.
 */
export function generateCucumberJson(
  manifest: GenerationManifest,
  topology: TestSuiteTopology,
  ir: IntermediateRepresentation,
): CucumberFeature[] {
  const features: CucumberFeature[] = [];

  for (const feature of manifest.featuresGenerated) {
    const flow = ir.flows.find((f) => f.id === feature.flowId);
    if (!flow) continue;

    const suite = topology.suites.find((s) => s.flowId === feature.flowId);
    const scenarios = parseFeatureScenarios(feature.content, flow, suite);

    features.push({
      keyword: 'Feature',
      name: flow.name,
      description: flow.description ?? '',
      id: kebab(flow.name),
      uri: feature.filePath,
      tags: extractFeatureTags(feature.content),
      elements: scenarios,
    });
  }

  return features;
}

interface ParsedScenario {
  name: string;
  tags: CucumberTag[];
  steps: CucumberStep[];
  lineNumber: number;
}

function parseFeatureScenarios(
  content: string,
  flow: FlowDefinition,
  suite: TestSuiteTopology['suites'][number] | undefined,
): CucumberScenario[] {
  const parsed = extractRawScenarios(content);
  return parsed.map((s) => buildScenario(s, flow, suite));
}

function extractRawScenarios(content: string): ParsedScenario[] {
  const scenarios: ParsedScenario[] = [];
  const lines = content.split('\n');
  let current: ParsedScenario | null = null;
  let pendingTags: CucumberTag[] = [];
  let stepLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('@')) {
      pendingTags = parseTags(line);
      continue;
    }

    if (line.startsWith('Scenario:')) {
      if (current) scenarios.push(current);
      current = {
        name: line.slice('Scenario:'.length).trim(),
        tags: pendingTags,
        steps: [],
        lineNumber: i + 1,
      };
      pendingTags = [];
      stepLine = i + 1;
      continue;
    }

    if (current && isStepLine(line)) {
      stepLine++;
      current.steps.push(parseStepLine(line, stepLine));
    }
  }

  if (current) scenarios.push(current);
  return scenarios;
}

function parseTags(line: string): CucumberTag[] {
  return line
    .split(/\s+/)
    .filter((t) => t.startsWith('@'))
    .map((name) => ({ name }));
}

function isStepLine(line: string): boolean {
  return (
    line.startsWith('Given ') ||
    line.startsWith('When ') ||
    line.startsWith('Then ') ||
    line.startsWith('And ')
  );
}

function parseStepLine(line: string, lineNumber: number): CucumberStep {
  const keyword = line.split(' ')[0] + ' ';
  const name = line.slice(keyword.length);
  // No execution happens at generation time — a freshly parsed step is pending.
  return { keyword, name, line: lineNumber, result: { status: 'pending', duration: 0 } };
}

function buildScenario(
  parsed: {
    name: string;
    tags: CucumberTag[];
    steps: CucumberStep[];
    lineNumber: number;
  },
  flow: FlowDefinition,
  suite: TestSuiteTopology['suites'][number] | undefined,
): CucumberScenario {
  const status = resolveScenarioStatus(parsed.name, parsed.tags, flow, suite);

  const steps = parsed.steps.map((step) => ({
    ...step,
    result: { status, duration: 0 },
  }));

  return {
    keyword: 'Scenario',
    name: parsed.name,
    description: '',
    id: kebab(parsed.name),
    type: 'scenario',
    tags: parsed.tags,
    steps,
  };
}

/**
 * Resolves a scenario's status from the derived topology. Generation never
 * executes anything, so the best a scenario can be is 'pending' (a derived
 * test case exists for it); scenarios with no backing test case are 'skipped'.
 */
function resolveScenarioStatus(
  scenarioName: string,
  tags: CucumberTag[],
  flow: FlowDefinition,
  suite: TestSuiteTopology['suites'][number] | undefined,
): 'pending' | 'skipped' {
  if (!suite) return 'skipped';

  // Match moment-based test cases by scenario name → moment name
  const bracketIdx = scenarioName.indexOf(' [');
  const momentName = bracketIdx !== -1 ? scenarioName.slice(0, bracketIdx) : scenarioName;
  const variant =
    bracketIdx !== -1 ? scenarioName.slice(bracketIdx + 2, scenarioName.length - 1) : undefined;

  const moment = flow.moments.find((m) => m.name === momentName);
  if (moment) {
    const matchingCase = suite.testCases.find(
      (tc) => tc.momentId === moment.id && (variant === undefined || tc.variant === variant),
    );
    return matchingCase ? 'pending' : 'skipped';
  }

  // Synthetic saga scenarios (state transitions / compensation) do not map to
  // a moment — they are backed by the suite's saga test cases, if any.
  const isSaga = tags.some((t) => t.name.startsWith('@saga:'));
  if (isSaga) {
    const matchingCases = suite.testCases.filter((tc) => tc.momentId.startsWith('saga-'));
    if (matchingCases.length === 0) return 'skipped';
    return 'pending';
  }

  return 'skipped';
}

function extractFeatureTags(content: string): CucumberTag[] {
  const firstLine = content.split('\n')[0]?.trim() ?? '';
  if (!firstLine.startsWith('@')) return [];
  return firstLine
    .split(/\s+/)
    .filter((t) => t.startsWith('@'))
    .map((name) => ({ name }));
}

function kebab(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
