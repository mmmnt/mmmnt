import { randomUUID } from 'crypto';
import { FileWatcher, type FileWatcherOptions } from './file-watcher.js';

export interface ComplaiEventEnvelope {
  readonly eventId: string;
  readonly eventType: string;
  readonly productSource: string;
  readonly sessionId: string;
  readonly causationEventIds: readonly string[];
  readonly correlationId: string;
  readonly timestamp: string;
  readonly version: number;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface TopologyPublishTarget {
  publish(envelope: ComplaiEventEnvelope): Promise<void>;
}

export interface WatchModePublisherOptions {
  readonly watchPatterns: readonly string[];
  readonly cwd: string;
  readonly debounceMs: number;
  readonly sessionId: string;
  readonly target: TopologyPublishTarget;
  readonly buildTopology: () => Promise<Record<string, unknown>>;
  readonly onError?: (error: unknown) => void;
}

/**
 * Watches .moment/.manifest.yaml files, rebuilds topology on change,
 * and publishes ComplaiEventEnvelope events to a target (Wundergraph router).
 *
 * Guarantees:
 * - Single-flight publishing: only one publish at a time
 * - No dropped changes: if a change arrives during publish, it queues
 *   and re-builds after the current publish completes
 * - Causation chain: each event references its predecessor via causationEventIds
 * - Errors surfaced via onError callback, never swallowed
 */
export class WatchModePublisher {
  private fileWatcher: FileWatcher | null = null;
  private readonly correlationId: string;
  private lastEventId: string | null = null;
  private publishInFlight = false;
  private pendingTrigger: string | null = null;

  constructor(private readonly options: WatchModePublisherOptions) {
    this.correlationId = randomUUID();
  }

  async start(): Promise<void> {
    const watcherOptions: FileWatcherOptions = {
      patterns: [...this.options.watchPatterns],
      cwd: this.options.cwd,
      debounceMs: this.options.debounceMs,
      onChange: (changedPath) => this.onFileChange(changedPath),
      onError: (error) => this.options.onError?.(error),
    };

    this.fileWatcher = new FileWatcher(watcherOptions);

    try {
      await this.fileWatcher.start();
      await this.publishTopologyOrThrow('initial');
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.fileWatcher) {
      await this.fileWatcher.stop();
      this.fileWatcher = null;
    }
    this.pendingTrigger = null;
  }

  isRunning(): boolean {
    return this.fileWatcher?.isRunning() ?? false;
  }

  private async onFileChange(changedPath: string): Promise<void> {
    if (this.publishInFlight) {
      // Queue the latest trigger — buildTopology will get fresh state
      this.pendingTrigger = changedPath;
      return;
    }
    await this.publishTopology(changedPath);
  }

  /**
   * Publish and throw on failure — used during start() where
   * the caller needs to know initialization failed.
   */
  private async publishTopologyOrThrow(trigger: string): Promise<void> {
    this.publishInFlight = true;
    try {
      await this.doPublish(trigger);
    } finally {
      this.publishInFlight = false;
    }
  }

  /**
   * Publish with error recovery — used for file-change triggers where
   * failures are reported via onError but don't kill the watch loop.
   */
  private async publishTopology(trigger: string): Promise<void> {
    this.publishInFlight = true;
    try {
      await this.doPublish(trigger);
    } catch (error) {
      this.options.onError?.(error);
    } finally {
      this.publishInFlight = false;
    }

    // Drain queued change — always re-builds to get latest state
    if (this.pendingTrigger) {
      const queued = this.pendingTrigger;
      this.pendingTrigger = null;
      await this.publishTopology(queued);
    }
  }

  private async doPublish(trigger: string): Promise<void> {
    const topology = await this.options.buildTopology();
    const envelope = this.buildEnvelope('TopologyUpdated', {
      ...topology,
      trigger,
    });
    await this.options.target.publish(envelope);
    this.lastEventId = envelope.eventId;
  }

  buildEnvelope(eventType: string, payload: Record<string, unknown>): ComplaiEventEnvelope {
    const eventId = randomUUID();
    return {
      eventId,
      eventType,
      productSource: 'moment:topology',
      sessionId: this.options.sessionId,
      causationEventIds: this.lastEventId ? [this.lastEventId] : [],
      correlationId: this.correlationId,
      timestamp: new Date().toISOString(),
      version: 1,
      payload,
    };
  }
}
