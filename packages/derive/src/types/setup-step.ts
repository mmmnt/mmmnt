export interface SetupStep {
  readonly contextName: string;
  readonly aggregateName: string;
  readonly precondition: string;
}
