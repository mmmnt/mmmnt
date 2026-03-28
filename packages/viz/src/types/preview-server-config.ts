/** @default port 3000 */
export interface PreviewServerConfig {
  readonly port: number;
  readonly watchPaths: readonly string[];
  /** Debounce milliseconds for file watcher. @default 300 */
  readonly refreshInterval: number;
  /** Auto-open browser on start. @default true */
  readonly openBrowser: boolean;
}
