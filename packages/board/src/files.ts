import { renderBoardSvg, renderFrameSvg } from './svg.js';
import { placeFrames } from './placement.js';
import type { BoardProjection } from './types.js';

/** A frame id as a file name: letters, digits and dashes only, so every frame has a safe name. */
export function frameFileName(frameId: string): string {
  return `${frameId.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}.svg`;
}

/** The files of a board: `board.svg`, one SVG per frame, `manifest.json`; stable order, byte-stable. */
export function boardFiles(projection: BoardProjection, only?: string): Map<string, string> {
  const files = new Map<string, string>();
  const places = placeFrames(projection.frames);
  if (only === undefined) files.set('board.svg', renderBoardSvg(projection.frames, places));
  for (const frame of projection.frames) {
    if (only === undefined || frame.id === only)
      files.set(frameFileName(frame.id), renderFrameSvg(frame));
  }
  files.set('manifest.json', `${JSON.stringify(projection.manifest, null, 2)}\n`);
  return files;
}
