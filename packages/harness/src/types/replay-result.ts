export interface DivergencePoint {
  readonly frameIndex: number;
  readonly expectedState: string;
  readonly actualState: string;
  readonly eventThatCaused: string;
}

export interface ReplayResult {
  readonly flowId: string;
  readonly stepsReplayed: number;
  readonly divergencePoints: readonly DivergencePoint[];
  readonly finalStateMatch: boolean;
}
