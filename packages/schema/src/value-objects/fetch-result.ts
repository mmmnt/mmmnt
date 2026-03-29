export interface FetchDiagnostic {
  readonly level: 'warning' | 'error';
  readonly message: string;
}

export type FetchResult =
  | { readonly status: 'success'; readonly packVersion: string }
  | { readonly status: 'cacheHit'; readonly packVersion: string }
  | { readonly status: 'unreachable'; readonly diagnostic: FetchDiagnostic };
