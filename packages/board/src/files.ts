import type { BoardProjection } from './types.js';
import { renderFrameSvg } from './svg.js';

/** A frame id as a file name: letters, digits and dashes only, so every frame has a safe name. */
export function frameFileName(frameId: string): string {
  return `${frameId.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}.svg`;
}

/** The files of a board: one SVG per frame and `manifest.json`, in a stable order and byte-stable. */
export function boardFiles(projection: BoardProjection, only?: string): Map<string, string> {
  const files = new Map<string, string>();
  for (const frame of projection.frames) {
    if (only === undefined || frame.id === only)
      files.set(frameFileName(frame.id), renderFrameSvg(frame));
  }
  files.set('manifest.json', `${JSON.stringify(projection.manifest, null, 2)}\n`);
  return files;
}
