/** Preview server configuration. */
export interface PreviewServerConfig {
  readonly port: number;
  readonly watchPaths: readonly string[];
  /** Debounce milliseconds for file watcher. */
  readonly refreshInterval: number;
  /** Auto-open browser on start. */
  readonly openBrowser: boolean;
}
