/**
 * moment serve — WebSocket live bridge to Facet (ADR-031)
 *
 * Starts a local WebSocket server that:
 * 1. Parses the .moment specification
 * 2. Runs the full pipeline (parse → derive → topology + scenarios)
 * 3. Opens a WebSocket on ws://localhost:{port}
 * 4. Sends WsInitialLoad on connection
 * 5. Watches for file changes and pushes updates
 *
 * MMNT-4881
 */

import { readFileSync, existsSync, watchFile, unwatchFile } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { MomentParser } from '@mmmnt/core';
import type { IntermediateRepresentation, Diagnostic } from '@mmmnt/core';
import {
  generateSimulationScenario,
  generateAllScenarios,
  deriveNegativeScenarios,
  TopologyEmitter,
  generateEventCatalog,
  generateImpactAnalysis,
  generateSagaStateMachines,
} from '@mmmnt/derive';
import type { SimulationScenario, SimulationTopology } from '@mmmnt/derive';

// ---------------------------------------------------------------------------
// Message types (ADR-031 §2)
// ---------------------------------------------------------------------------

interface WsInitialLoad {
  type: 'initial-load';
  sessionId: string;
  specFile: string;
  manifest: ManifestPayload;
  topologies: Record<string, SimulationTopology>;
  scenarios: Record<string, SimulationScenario>;
  artifacts: ArtifactPayload;
}

interface WsTopologyUpdate {
  type: 'topology-update';
  sessionId: string;
  flowId: string;
  topology: SimulationTopology;
  manifest: ManifestPayload;
}

interface WsScenarioUpdate {
  type: 'scenario-update';
  sessionId: string;
  flowId: string;
  scenarios: Record<string, SimulationScenario>;
}

interface WsArtifactUpdate {
  type: 'artifact-update';
  sessionId: string;
  artifacts: ArtifactPayload;
}

interface WsError {
  type: 'error';
  sessionId: string;
  phase: 'parse' | 'derive' | 'topology' | 'simulate';
  message: string;
  diagnostics: Diagnostic[];
}

interface ManifestPayload {
  flows: ManifestFlow[];
  artifacts: Record<string, string>;
}

interface ManifestFlow {
  flowId: string;
  flowName: string;
  topology: string;
  scenarioCount: number;
}

interface ArtifactPayload {
  eventCatalog: unknown;
  impactAnalysis: unknown;
  sagaStateMachines: unknown;
}

// ---------------------------------------------------------------------------
// Pipeline: parse → derive → build payloads
// ---------------------------------------------------------------------------

interface PipelineResult {
  ir: IntermediateRepresentation;
  manifest: ManifestPayload;
  topologies: Record<string, SimulationTopology>;
  scenarios: Record<string, SimulationScenario>;
  artifacts: ArtifactPayload;
}

async function runPipeline(specPath: string, includeAll: boolean): Promise<PipelineResult> {
  const content = readFileSync(specPath, 'utf-8');
  const parser = new MomentParser();
  const result = await parser.parseContent(content);

  if (!result.success) {
    const error = new Error(`Parse failed with ${result.diagnostics.length} diagnostic(s)`);
    (error as unknown as Record<string, unknown>).diagnostics = result.diagnostics;
    (error as unknown as Record<string, unknown>).phase = 'parse';
    throw error;
  }

  const ir = result.ir!;
  return buildPayloads(ir, includeAll);
}

function buildPayloads(ir: IntermediateRepresentation, includeAll: boolean): PipelineResult {
  const topoEmitter = new TopologyEmitter();
  const topologies: Record<string, SimulationTopology> = {};
  const scenarios: Record<string, SimulationScenario> = {};
  const manifestFlows: ManifestFlow[] = [];

  for (const flow of ir.flows) {
    const flowSlug = kebab(flow.name);
    const topoKey = `topology-${flowSlug}.json`;
    topologies[topoKey] = topoEmitter.emit(ir, flow);

    const flowScenarios: SimulationScenario[] = includeAll
      ? [...generateAllScenarios(ir, flow), ...deriveNegativeScenarios(ir, flow)]
      : [generateSimulationScenario(ir, flow)];

    for (const s of flowScenarios) {
      scenarios[`${s.scenarioId}.json`] = s;
    }

    manifestFlows.push({
      flowId: flow.id,
      flowName: flow.name,
      topology: topoKey,
      scenarioCount: flowScenarios.length,
    });
  }

  return {
    ir,
    manifest: {
      flows: manifestFlows,
      artifacts: {
        eventCatalog: 'event-catalog.json',
        impactAnalysis: 'impact-analysis.json',
        sagaStateMachines: 'saga-state-machines.json',
      },
    },
    topologies,
    scenarios,
    artifacts: {
      eventCatalog: generateEventCatalog(ir),
      impactAnalysis: generateImpactAnalysis(ir),
      sagaStateMachines: generateSagaStateMachines(ir),
    },
  };
}

function kebab(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ---------------------------------------------------------------------------
// WebSocket server
// ---------------------------------------------------------------------------

const MAX_CLIENTS = 10;
const PING_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 10_000;

interface TrackedClient {
  ws: WebSocket;
  isAlive: boolean;
  pongTimer: ReturnType<typeof setTimeout> | null;
}

function broadcast(clients: Set<TrackedClient>, message: string): void {
  for (const client of clients) {
    if (client.ws.readyState === client.ws.OPEN) {
      client.ws.send(message);
    }
  }
}

function setupConnectionHandler(
  wss: WebSocketServer,
  clients: Set<TrackedClient>,
  sessionId: string,
  getResult: () => PipelineResult,
  specPath: string,
  log: (msg: string) => void,
): void {
  wss.on('connection', (ws) => {
    if (clients.size >= MAX_CLIENTS) {
      ws.close(1013, 'Maximum clients reached');
      return;
    }

    const client: TrackedClient = { ws, isAlive: true, pongTimer: null };
    clients.add(client);

    ws.on('pong', () => {
      client.isAlive = true;
      if (client.pongTimer) {
        clearTimeout(client.pongTimer);
        client.pongTimer = null;
      }
    });

    ws.on('close', () => {
      if (client.pongTimer) clearTimeout(client.pongTimer);
      clients.delete(client);
    });

    ws.on('error', () => {
      if (client.pongTimer) clearTimeout(client.pongTimer);
      clients.delete(client);
    });

    const result = getResult();
    const initialLoad: WsInitialLoad = {
      type: 'initial-load',
      sessionId,
      specFile: specPath,
      manifest: result.manifest,
      topologies: result.topologies,
      scenarios: result.scenarios,
      artifacts: result.artifacts,
    };
    ws.send(JSON.stringify(initialLoad));
    log(`Client connected (${clients.size} total)`);
  });
}

function startHeartbeat(
  clients: Set<TrackedClient>,
  log: (msg: string) => void,
): ReturnType<typeof setInterval> {
  return setInterval(() => {
    for (const client of clients) {
      if (!client.isAlive) {
        client.ws.terminate();
        clients.delete(client);
        log('Client terminated (no pong)');
        continue;
      }
      client.isAlive = false;
      client.ws.ping();
      client.pongTimer = setTimeout(() => {
        if (!client.isAlive) {
          client.ws.terminate();
          clients.delete(client);
          log('Client terminated (pong timeout)');
        }
      }, PONG_TIMEOUT_MS);
    }
  }, PING_INTERVAL_MS);
}

function pushUpdates(result: PipelineResult, clients: Set<TrackedClient>, sessionId: string): void {
  for (const flow of result.manifest.flows) {
    const topology = result.topologies[flow.topology];
    if (!topology) continue;

    const topoMsg: WsTopologyUpdate = {
      type: 'topology-update',
      sessionId,
      flowId: flow.flowId,
      topology,
      manifest: result.manifest,
    };
    broadcast(clients, JSON.stringify(topoMsg));

    const flowScenarios: Record<string, SimulationScenario> = {};
    for (const [key, s] of Object.entries(result.scenarios)) {
      if (s.flowId === flow.flowId) flowScenarios[key] = s;
    }
    const scenarioMsg: WsScenarioUpdate = {
      type: 'scenario-update',
      sessionId,
      flowId: flow.flowId,
      scenarios: flowScenarios,
    };
    broadcast(clients, JSON.stringify(scenarioMsg));
  }

  const artifactMsg: WsArtifactUpdate = {
    type: 'artifact-update',
    sessionId,
    artifacts: result.artifacts,
  };
  broadcast(clients, JSON.stringify(artifactMsg));
}

function setupFileWatcher(
  specPath: string,
  includeAll: boolean,
  clients: Set<TrackedClient>,
  sessionId: string,
  setResult: (r: PipelineResult) => void,
  log: (msg: string) => void,
  logError: (msg: string) => void,
): void {
  let rebuildInFlight = false;
  let rebuildQueued = false;

  const rebuild = async (): Promise<void> => {
    if (rebuildInFlight) {
      rebuildQueued = true;
      return;
    }
    rebuildInFlight = true;
    try {
      log('File changed, rebuilding...');
      const newResult = await runPipeline(specPath, includeAll);
      setResult(newResult);
      pushUpdates(newResult, clients, sessionId);
      log('Rebuild complete, updates pushed');
    } catch (error) {
      const phase = ((error as Record<string, unknown>).phase as string) ?? 'parse';
      const diagnostics = ((error as Record<string, unknown>).diagnostics as Diagnostic[]) ?? [];
      const msg = error instanceof Error ? error.message : String(error);
      const wsError: WsError = {
        type: 'error',
        sessionId,
        phase: phase as WsError['phase'],
        message: msg,
        diagnostics,
      };
      broadcast(clients, JSON.stringify(wsError));
      logError(`Pipeline error: ${msg}`);
    } finally {
      rebuildInFlight = false;
    }
    if (rebuildQueued) {
      rebuildQueued = false;
      await rebuild();
    }
  };

  watchFile(specPath, { interval: 500 }, () => {
    void rebuild();
  });
}

function setupGracefulShutdown(
  wss: WebSocketServer,
  clients: Set<TrackedClient>,
  pingInterval: ReturnType<typeof setInterval>,
  specPath: string,
  log: (msg: string) => void,
): void {
  const shutdown = (): void => {
    log('\nShutting down...');
    clearInterval(pingInterval);
    unwatchFile(specPath);

    for (const client of clients) {
      if (client.pongTimer) clearTimeout(client.pongTimer);
      client.ws.close(1000, 'Moment server shutting down');
    }

    setTimeout(() => {
      for (const client of clients) {
        client.ws.terminate();
      }
      wss.close();
      process.exit(0);
    }, 3000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

export interface ServeCommandResult {
  readonly success: boolean;
  readonly message: string;
}

export async function runServe(
  argv: string[],
  log: (msg: string) => void = console.log,
  logError: (msg: string) => void = console.error,
): Promise<ServeCommandResult> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      port: { type: 'string', short: 'p' },
      all: { type: 'boolean' },
    },
    allowPositionals: true,
    strict: false,
  });

  const specPath = positionals[0];
  if (!specPath) {
    return { success: false, message: 'Usage: moment serve <file.moment> [--port 4321] [--all]' };
  }

  const resolvedPath = resolve(specPath);
  if (!existsSync(resolvedPath)) {
    return { success: false, message: `Error: File not found: ${resolvedPath}` };
  }

  const port = parseInt(values.port ?? '4321', 10);
  const includeAll = values.all === true;
  const sessionId = randomUUID();
  const clients = new Set<TrackedClient>();

  let lastResult: PipelineResult;
  try {
    lastResult = await runPipeline(resolvedPath, includeAll);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Initial pipeline failed: ${msg}` };
  }

  const wss = await startServerWithRetry(port, log);
  if (!wss) {
    return { success: false, message: `Error: Could not bind to port ${port} after 3 attempts` };
  }

  log(`Serving ${resolvedPath} on ws://localhost:${port}`);
  log(`Flows: ${lastResult.manifest.flows.map((f) => f.flowName).join(', ')}`);
  log(`Scenarios: ${Object.keys(lastResult.scenarios).length} | Press Ctrl+C to stop`);

  setupConnectionHandler(wss, clients, sessionId, () => lastResult, resolvedPath, log);
  const pingInterval = startHeartbeat(clients, log);
  setupFileWatcher(
    resolvedPath,
    includeAll,
    clients,
    sessionId,
    (r) => {
      lastResult = r;
    },
    log,
    logError,
  );
  setupGracefulShutdown(wss, clients, pingInterval, resolvedPath, log);

  return { success: true, message: `Serving on ws://localhost:${port}` };
}

async function startServerWithRetry(
  port: number,
  log: (msg: string) => void,
): Promise<WebSocketServer | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await startServer(port);
    } catch {
      if (attempt < 2) {
        log(`Port ${port} in use, retrying in 1s...`);
        await sleep(1000);
      }
    }
  }
  return null;
}

function startServer(port: number): Promise<WebSocketServer> {
  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({ port });
    wss.on('listening', () => resolve(wss));
    wss.on('error', (err) => reject(err));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
