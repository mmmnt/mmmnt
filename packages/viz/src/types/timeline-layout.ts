export interface TimelineLane {
  readonly contextId: string;
  readonly contextName: string;
  readonly y: number;
  readonly height: number;
}

export interface TimelineEntry {
  readonly momentId: string;
  readonly momentName: string;
  readonly contextId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Notes of the moment (ADR-040 D3): narration drawn in the column; `laneId` is the lane a note speaks for. */
  readonly notes?: readonly { readonly text: string; readonly laneId?: string }[];
  /** Same-moment `triggered-by` pairs (ADR-040 D4), drawn as short arrows inside the column. */
  readonly hops?: readonly { readonly from: string; readonly to: string }[];
  /** Causes of the commands placed in the moment (ADR-040 D2), drawn as chips on the command. */
  readonly causes?: readonly { readonly nodeName: string; readonly cause: string }[];
}

export interface TimelineConnection {
  readonly connectionId: string;
  readonly sourceMomentId: string;
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
