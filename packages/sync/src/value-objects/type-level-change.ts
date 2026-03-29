export interface TypeLevelChange {
  readonly symbolName: string;
  readonly changeKind: string;
  readonly previousDefinition?: string;
  readonly newDefinition?: string;
}
