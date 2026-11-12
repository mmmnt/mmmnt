export { projectBoard, boardExtent } from './project-board.js';
export { renderFrameSvg, renderBoardSvg } from './svg.js';
export { boardFiles, frameFileName } from './files.js';
export { placeFrames, extent } from './placement.js';
export { sweepIr, irPaths, RENDERED, UNRENDERED } from './coverage.js';
export {
  BoardNumberingError,
  numberFlow,
  numberFlows,
  numberContexts,
  armIds,
} from './numbering.js';
export { BoardPointerError } from './pointers.js';
export { USES } from './uses.js';
export {
  SWATCH,
  OPTIONAL_SWATCH,
  KIND_SWATCH,
  STICKY_COLOR,
  fillOf,
  nearestStickyColor,
} from './palette.js';
export type { SwatchName, NodeKind, StickyColor } from './palette.js';
export type {
  BoardProjection,
  BoardFrame,
  BoardItem,
  BoardConnector,
  BoardManifest,
  BoardOptions,
  ManifestFrame,
  ManifestNode,
  ManifestEdge,
  Placement,
  Pointer,
  UnrenderedEntry,
} from './types.js';
export type { Sweep } from './coverage.js';
