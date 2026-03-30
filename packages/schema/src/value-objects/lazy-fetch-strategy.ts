export type FetchMode = 'lazy' | 'signal';

export interface LazyFetchStrategy {
  readonly mode: FetchMode;
  readonly cdnEndpoint?: string;
  readonly ttlSeconds?: number;
  readonly lastFetchedAt?: string;
  readonly cachedPackVersion?: string;
}
