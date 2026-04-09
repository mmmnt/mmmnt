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

import { readFileSync, existsSync, statSync, watch, type FSWatcher } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
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

export async function runPipeline(specPath: string, includeAll: boolean): Promise<PipelineResult> {
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
// Facet directory mode: hydrate payloads from pre-built JSON files produced
// by `moment simulate --out-dir <dir> --all` instead of deriving live from a
// .moment spec. Lets `serve` bridge a directory of artifacts to Facet over
// the same WebSocket protocol, no spec parsing required.
// ---------------------------------------------------------------------------

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

// ---------------------------------------------------------------------------
// Shape of the on-disk manifest.json written by `moment simulate --out-dir`.
// This is the upload/index manifest — distinct from the WS payload's
// `WsInitialLoad.manifest` field (which we build from this at serve time).
// We only depend on the fields we actually need to hydrate the WS payload.
// ---------------------------------------------------------------------------

interface FacetManifestScenario {
  readonly scenarioId: string;
  readonly scenarioLabel: string;
  readonly description: string;
  readonly file: string;
  readonly eventCount: number;
  readonly pathLength: number;
  readonly branchCount: number;
  readonly isHappyPath: boolean;
  readonly isNegative: boolean;
}

interface FacetManifestFlow {
  readonly flowId: string;
  readonly flowName: string;
  readonly topology: string;
  readonly scenarios: readonly FacetManifestScenario[];
}

interface FacetManifest {
  readonly flows: readonly FacetManifestFlow[];
  readonly artifacts: Readonly<Record<string, string>>;
}

/**
 * Load and validate `<dir>/manifest.json`. This is the authoritative index
 * of a facet directory — serve fails fast if it's missing or malformed rather
 * than globbing and guessing. A malformed manifest is always a bug upstream
 * (in simulate) and silently tolerating it hides real problems.
 */
function loadFacetManifest(dir: string): FacetManifest {
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(
      `Facet directory is missing manifest.json at ${manifestPath}. ` +
        `Run \`moment simulate <spec.moment> --out-dir ${dir} --all\` to populate it.`,
    );
  }

  const raw = readJson(manifestPath);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${manifestPath}: expected a JSON object at the root`);
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.flows)) {
    throw new Error(`${manifestPath}: expected a 'flows' array`);
  }
  if (!obj.artifacts || typeof obj.artifacts !== 'object' || Array.isArray(obj.artifacts)) {
    throw new Error(`${manifestPath}: expected an 'artifacts' object`);
  }
  // We trust simulate's output shape for inner fields — it's tested at the
  // source and this helper is only invoked on directories simulate wrote.
  return {
    flows: obj.flows as readonly FacetManifestFlow[],
    artifacts: obj.artifacts as Readonly<Record<string, string>>,
  };
}

/**
 * Read the artifact file named in `manifest.artifacts.<kind>`, if present.
 * Best-effort: returns null on missing file, malformed JSON, or a path that
 * would escape the facet directory. Artifacts are non-essential for the
 * happy serve flow, so one bad artifact file should not kill startup.
 */
function loadArtifact(dir: string, filename: string | undefined): unknown {
  if (!filename) return null;
  let fullPath: string;
  try {
    fullPath = resolveWithinFacetDir(dir, filename);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[serve] refusing to load artifact ${filename}: ${msg}`);
    return null;
  }
  if (!existsSync(fullPath)) return null;
  try {
    return readJson(fullPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[serve] skipping artifact ${filename}: ${msg}`);
    return null;
  }
}

/**
 * Decide whether a scenario should be included given the `--all` flag.
 * Default (no --all): only happy-path scenarios.
 * With --all: every scenario, including negatives.
 */
function shouldIncludeScenario(scenario: FacetManifestScenario, includeAll: boolean): boolean {
  if (includeAll) return true;
  return scenario.isHappyPath === true;
}

/**
 * Defense in depth against path traversal via manifest-controlled filenames.
 * A malicious `manifest.json` could list `../secrets.json` or an absolute
 * path; we resolve against the base directory and verify the result stays
 * inside it using a path-separator boundary check so that `/base-sibling`
 * cannot masquerade as being inside `/base`.
 */
function resolveWithinFacetDir(dir: string, relative: string): string {
  const resolvedBase = resolve(dir);
  const resolvedTarget = resolve(resolvedBase, relative);
  const baseWithSep = resolvedBase.endsWith(sep) ? resolvedBase : resolvedBase + sep;
  if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(baseWithSep)) {
    throw new Error(
      `Facet manifest references '${relative}' which escapes the facet directory ${dir}`,
    );
  }
  return resolvedTarget;
}

/**
 * Read a JSON file that's required by the manifest. Throws on missing file
 * or parse failure with a message that names which manifest entry caused it.
 * Malformed scenario/topology files in a manifest-driven directory are a bug
 * upstream and must not be tolerated silently.
 */
function readRequiredJson(fullPath: string, manifestEntry: string): unknown {
  if (!existsSync(fullPath)) {
    throw new Error(`Facet manifest references '${manifestEntry}' that does not exist`);
  }
  try {
    return readJson(fullPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Facet file '${manifestEntry}' is not valid JSON: ${msg}`);
  }
}

/**
 * Normalize the artifact-filename map from the manifest, applying defaults
 * so both the returned WS manifest and the disk loader see the same names.
 * Without this, the WS manifest could advertise a default filename while the
 * loader looks at the (possibly undefined) raw value and returns null.
 */
function normalizeArtifactFilenames(raw: Readonly<Record<string, string>>): {
  readonly eventCatalog: string;
  readonly impactAnalysis: string;
  readonly sagaStateMachines: string;
} {
  return {
    eventCatalog: raw.eventCatalog ?? 'event-catalog.json',
    impactAnalysis: raw.impactAnalysis ?? 'impact-analysis.json',
    sagaStateMachines: raw.sagaStateMachines ?? 'saga-state-machines.json',
  };
}

/**
 * Read the topology + scenarios for a single flow, enforcing the
 * path-within-directory guard for every manifest-controlled filename.
 */
function loadFlowAssets(
  dir: string,
  flow: FacetManifestFlow,
  includeAll: boolean,
  topologies: Record<string, SimulationTopology>,
  scenarios: Record<string, SimulationScenario>,
): number {
  const topologyPath = resolveWithinFacetDir(dir, flow.topology);
  topologies[flow.topology] = readRequiredJson(topologyPath, flow.topology) as SimulationTopology;

  const selected = flow.scenarios.filter((s) => shouldIncludeScenario(s, includeAll));
  for (const scenarioEntry of selected) {
    const scenarioPath = resolveWithinFacetDir(dir, scenarioEntry.file);
    scenarios[scenarioEntry.file] = readRequiredJson(
      scenarioPath,
      scenarioEntry.file,
    ) as SimulationScenario;
  }

  return selected.length;
}

/**
 * Build a `PipelineResult` by reading a directory of facet artifacts written
 * by `moment simulate --out-dir`. **Manifest-driven**, not glob-based: uses
 * `manifest.json` as the authoritative index of flows → topology + scenarios
 * + artifacts. Fails fast if the manifest is missing or malformed, if any
 * referenced file is missing or unreadable, or if the manifest tries to
 * escape the facet directory.
 *
 * `includeAll = false` (the default) filters to happy-path scenarios only.
 * `includeAll = true` serves every scenario in the manifest.
 */
export function runFacetDirPipeline(dir: string, includeAll: boolean): PipelineResult {
  const facetManifest = loadFacetManifest(dir);

  const topologies: Record<string, SimulationTopology> = {};
  const scenarios: Record<string, SimulationScenario> = {};
  const manifestFlows: ManifestFlow[] = [];

  for (const flow of facetManifest.flows) {
    const scenarioCount = loadFlowAssets(dir, flow, includeAll, topologies, scenarios);
    manifestFlows.push({
      flowId: flow.flowId,
      flowName: flow.flowName,
      topology: flow.topology,
      scenarioCount,
    });
  }

  // Normalize once so the WS manifest and the artifact loader agree on names.
  const artifactNames = normalizeArtifactFilenames(facetManifest.artifacts);

  return {
    // No IR in facet-dir mode — downstream pushUpdates/connection handlers
    // only touch manifest/topologies/scenarios/artifacts, never `ir`.
    ir: {
      metadata: { name: '', description: '' },
      contexts: [],
      flows: [],
      relationships: [],
    } as unknown as IntermediateRepresentation,
    manifest: {
      flows: manifestFlows,
      artifacts: artifactNames,
    },
    topologies,
    scenarios,
    artifacts: {
      eventCatalog: loadArtifact(dir, artifactNames.eventCatalog),
      impactAnalysis: loadArtifact(dir, artifactNames.impactAnalysis),
      sagaStateMachines: loadArtifact(dir, artifactNames.sagaStateMachines),
    },
  };
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
    if (client.ws.readyState === WebSocket.OPEN) {
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
): FSWatcher {
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

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const watcher = watch(specPath, () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void rebuild();
    }, 300);
  });

  return watcher;
}

function setupGracefulShutdown(
  wss: WebSocketServer,
  clients: Set<TrackedClient>,
  pingInterval: ReturnType<typeof setInterval>,
  fileWatcher: FSWatcher,
  log: (msg: string) => void,
): void {
  const shutdown = (): void => {
    log('\nShutting down...');
    clearInterval(pingInterval);
    fileWatcher.close();

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

interface ServeArgs {
  resolvedPath: string;
  port: number;
  includeAll: boolean;
  /**
   * True when the positional argument is a directory of pre-built facet JSONs
   * (output of `moment simulate --out-dir <dir>`). False when it is a single
   * `.moment` spec file that gets parsed and derived live.
   */
  isFacetDir: boolean;
}

function parseServeArgs(argv: string[]): ServeArgs | ServeCommandResult {
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
    return {
      success: false,
      message: 'Usage: moment serve <file.moment | facet-dir> [--port 4321] [--all]',
    };
  }

  const resolvedPath = resolve(specPath);
  if (!existsSync(resolvedPath)) {
    return { success: false, message: `Error: Path not found: ${resolvedPath}` };
  }

  const isFacetDir = statSync(resolvedPath).isDirectory();

  const rawPort = values.port ?? '4321';
  const port = parseInt(rawPort, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { success: false, message: `Error: Invalid port "${rawPort}". Expected 1-65535.` };
  }

  return { resolvedPath, port, includeAll: values.all === true, isFacetDir };
}

async function initialPipeline(
  isFacetDir: boolean,
  resolvedPath: string,
  includeAll: boolean,
): Promise<PipelineResult> {
  return isFacetDir
    ? runFacetDirPipeline(resolvedPath, includeAll)
    : await runPipeline(resolvedPath, includeAll);
}

export function describeMode(isFacetDir: boolean, includeAll: boolean): string {
  if (!isFacetDir) return 'spec file';
  return `facet dir, ${includeAll ? 'all scenarios' : 'happy path only'}`;
}

function startWatcher(
  args: ServeArgs,
  clients: Set<TrackedClient>,
  sessionId: string,
  setResult: (r: PipelineResult) => void,
  log: (msg: string) => void,
  logError: (msg: string) => void,
): FSWatcher {
  return args.isFacetDir
    ? setupFacetDirWatcher(
        args.resolvedPath,
        args.includeAll,
        clients,
        sessionId,
        setResult,
        log,
        logError,
      )
    : setupFileWatcher(
        args.resolvedPath,
        args.includeAll,
        clients,
        sessionId,
        setResult,
        log,
        logError,
      );
}

export async function runServe(
  argv: string[],
  log: (msg: string) => void = console.log,
  logError: (msg: string) => void = console.error,
): Promise<ServeCommandResult> {
  const parsed = parseServeArgs(argv);
  if ('success' in parsed) return parsed;

  const { resolvedPath, port, includeAll, isFacetDir } = parsed;
  const sessionId = randomUUID();
  const clients = new Set<TrackedClient>();

  let lastResult: PipelineResult;
  try {
    lastResult = await initialPipeline(isFacetDir, resolvedPath, includeAll);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Initial pipeline failed: ${msg}` };
  }

  const wss = await startServerWithRetry(port, log);
  if (!wss) {
    return { success: false, message: `Error: Could not bind to port ${port} after 3 attempts` };
  }

  log(
    `Serving ${resolvedPath} (${describeMode(isFacetDir, includeAll)}) on ws://localhost:${port}`,
  );
  log(`Flows: ${lastResult.manifest.flows.map((f) => f.flowName).join(', ')}`);
  log(`Scenarios: ${Object.keys(lastResult.scenarios).length} | Press Ctrl+C to stop`);

  setupConnectionHandler(wss, clients, sessionId, () => lastResult, resolvedPath, log);
  const pingInterval = startHeartbeat(clients, log);
  const fileWatcher = startWatcher(
    parsed,
    clients,
    sessionId,
    (r) => {
      lastResult = r;
    },
    log,
    logError,
  );
  setupGracefulShutdown(wss, clients, pingInterval, fileWatcher, log);

  return { success: true, message: `Serving on ws://localhost:${port}` };
}

/**
 * Watch a facet directory for JSON file changes. On any change, re-read the
 * whole directory (fast — it's a few dozen small JSON files) and push updates
 * to all connected clients. Debounced 300ms to coalesce bulk writes from a
 * re-run of `moment simulate --out-dir`.
 */
function setupFacetDirWatcher(
  dir: string,
  includeAll: boolean,
  clients: Set<TrackedClient>,
  sessionId: string,
  setResult: (r: PipelineResult) => void,
  log: (msg: string) => void,
  logError: (msg: string) => void,
): FSWatcher {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let rebuildInFlight = false;
  let rebuildQueued = false;

  const rebuild = (): void => {
    if (rebuildInFlight) {
      rebuildQueued = true;
      return;
    }
    rebuildInFlight = true;
    try {
      log('Facet directory changed, reloading...');
      const newResult = runFacetDirPipeline(dir, includeAll);
      setResult(newResult);
      pushUpdates(newResult, clients, sessionId);
      log('Reload complete, updates pushed');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const wsError: WsError = {
        type: 'error',
        sessionId,
        phase: 'simulate',
        message: msg,
        diagnostics: [],
      };
      broadcast(clients, JSON.stringify(wsError));
      logError(`Facet reload error: ${msg}`);
    } finally {
      rebuildInFlight = false;
    }
    if (rebuildQueued) {
      rebuildQueued = false;
      rebuild();
    }
  };

  return watch(dir, { recursive: false }, (_eventType, filename) => {
    if (!filename || !filename.endsWith('.json')) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(rebuild, 300);
  });
}

async function startServerWithRetry(
  port: number,
  log: (msg: string) => void,
): Promise<WebSocketServer | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await startServer(port);
    } catch (err: unknown) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code)
          : undefined;

      if (code !== 'EADDRINUSE') throw err;

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
    const wss = new WebSocketServer({ port, host: '127.0.0.1' });
    wss.on('listening', () => resolve(wss));
    wss.on('error', (err) => reject(err));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
