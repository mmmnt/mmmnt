export interface SequenceParticipant {
  readonly contextId: string;
  readonly contextName: string;
  readonly x: number;
  readonly lifelineHeight: number;
}

export interface SequenceMessage {
  readonly fromContextId: string;
  readonly toContextId: string;
  readonly eventName: string;
  readonly y: number;
}

export interface SequenceActivation {
  readonly contextId: string;
  readonly startY: number;
  readonly endY: number;
}

export interface SequenceLayout {
  readonly participants: readonly SequenceParticipant[];
  readonly messages: readonly SequenceMessage[];
  readonly activations: readonly SequenceActivation[];
  readonly dimensions: { readonly width: number; readonly height: number };
}
