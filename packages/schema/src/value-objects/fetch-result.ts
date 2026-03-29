export interface Diagnostic {
  readonly level: 'warning' | 'error';
  readonly message: string;
}

export type FetchResult =
  | { readonly success: true; readonly packVersion: string }
  | { readonly success: true; readonly packVersion: string; readonly cached: true }
  | { readonly success: false; readonly diagnostic: Diagnostic };
