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
}

export class WatchModePublisher {
  private fileWatcher: FileWatcher | null = null;
  private correlationId: string;
  private lastEventId: string | null = null;

  constructor(private readonly options: WatchModePublisherOptions) {
    this.correlationId = randomUUID();
  }

  async start(): Promise<void> {
    const watcherOptions: FileWatcherOptions = {
      patterns: [...this.options.watchPatterns],
      cwd: this.options.cwd,
      debounceMs: this.options.debounceMs,
      onChange: (changedPath) => this.onFileChange(changedPath),
    };

    this.fileWatcher = new FileWatcher(watcherOptions);
    await this.fileWatcher.start();

    // Publish initial topology on start
    await this.publishTopology('initial');
  }

  stop(): void {
    if (this.fileWatcher) {
      this.fileWatcher.stop();
      this.fileWatcher = null;
    }
  }

  isRunning(): boolean {
    return this.fileWatcher?.isRunning() ?? false;
  }

  private async onFileChange(changedPath: string): Promise<void> {
    await this.publishTopology(changedPath);
  }

  private async publishTopology(trigger: string): Promise<void> {
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
