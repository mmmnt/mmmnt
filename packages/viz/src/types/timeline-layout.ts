export interface TimelineLane {
  readonly contextId: string;
  readonly contextName: string;
  readonly y: number;
  readonly height: number;
}

export interface TimelineEntry {
  readonly frameId: string;
  readonly frameName: string;
  readonly contextId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TimelineConnection {
  readonly connectionId: string;
  readonly sourceFrameId: string;
  readonly targetContextId: string;
  readonly sourceLaneY: number;
  readonly targetLaneY: number;
  readonly x: number;
}

export interface TimelineLayout {
  readonly lanes: readonly TimelineLane[];
  readonly entries: readonly TimelineEntry[];
  readonly connections: readonly TimelineConnection[];
  readonly dimensions: { readonly width: number; readonly height: number };
}
