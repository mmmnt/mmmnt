import type { BoardConnector, BoardFrame, BoardItem } from './types.js';
import { SWATCH, fillOf } from './palette.js';
import type { NodeKind, SwatchName } from './palette.js';
import { KIND_SWATCH, STICKY_COLOR } from './palette.js';

export const GAP = 20;
export const PAD = 40;

/** Builds one frame: items and connectors in frame-relative coordinates, in drawing order. */
export class FrameBuilder {
  readonly items: BoardItem[] = [];
  readonly connectors: BoardConnector[] = [];
  private seq = 0;
  private maxX = 0;
  private maxY = 0;

  constructor(
    readonly id: string,
    readonly title: string,
    readonly kind: BoardFrame['kind'],
    readonly number?: string,
    readonly numberSource?: BoardFrame['numberSource'],
  ) {}

  add(item: Omit<BoardItem, 'id'>): BoardItem {
    this.seq += 1;
    const full: BoardItem = { id: `${this.id}-${this.seq}`, ...item };
    this.items.push(full);
    this.maxX = Math.max(this.maxX, full.x + full.w);
    this.maxY = Math.max(this.maxY, full.y + full.h);
    return full;
  }

  /** A native sticky in the nearest named colour of the kind's swatch. */
  sticky(
    kind: NodeKind | 'moment',
    text: string,
    x: number,
    y: number,
    w: number,
    h: number,
    swatch?: SwatchName,
  ): BoardItem {
    const name = swatch ?? (kind === 'moment' ? 'moment' : KIND_SWATCH[kind]);
    const fill = name === null ? '#ffffff' : SWATCH[name];
    const base = {
      widget: 'sticky' as const,
      kind: kind === 'moment' ? ('moment' as const) : kind,
      text,
      x,
      y,
      w,
      h,
      fill,
    };
    return this.add(name === null ? base : { ...base, color: STICKY_COLOR[name] });
  }

  /** A shape with an exact hex: externals, contexts, stores, services. */
  shape(
    kind: NodeKind | 'banner' | 'container' | 'swatch',
    text: string,
    x: number,
    y: number,
    w: number,
    h: number,
    extra: Partial<BoardItem> = {},
  ): BoardItem {
    const fill =
      kind === 'banner'
        ? '#1a1a1a'
        : kind === 'container' || kind === 'swatch'
          ? '#ffffff'
          : fillOf(kind);
    return this.add({ widget: 'shape', kind, text, x, y, w, h, fill, ...extra });
  }

  text(
    text: string,
    x: number,
    y: number,
    w: number,
    size = 14,
    bold = false,
    color = '#1a1a1a',
  ): BoardItem {
    const lines = Math.max(
      1,
      text.split('\n').length + Math.floor(text.length / Math.max(1, w / (size * 0.55))),
    );
    return this.add({
      widget: 'text',
      kind: 'label',
      text,
      x,
      y,
      w,
      h: Math.ceil(lines * size * 1.4),
      fill: color,
      fontSize: size,
      bold,
    });
  }

  /** A spec pointer under a sticky. */
  pointer(text: string, x: number, y: number, w: number): BoardItem {
    return this.text(text, x, y, w, 11, false, '#595959');
  }

  /** Moves an item behind those added since `index`, so it reads as their container. */
  moveBehind(item: BoardItem, index: number): void {
    this.items.splice(this.items.indexOf(item), 1);
    this.items.splice(index, 0, item);
  }

  connect(
    from: BoardItem,
    to: BoardItem,
    opts: { label?: string; dashed?: boolean; shape?: 'straight' | 'elbowed' } = {},
  ): void {
    const c: BoardConnector = { from: from.id, to: to.id };
    if (opts.label !== undefined) c.label = opts.label;
    if (opts.dashed) c.dashed = true;
    if (opts.shape !== undefined) c.shape = opts.shape;
    this.connectors.push(c);
  }

  build(minWidth = 0, minHeight = 0): BoardFrame {
    return {
      id: this.id,
      title: this.title,
      kind: this.kind,
      ...(this.number !== undefined && { number: this.number }),
      ...(this.numberSource !== undefined && { numberSource: this.numberSource }),
      width: Math.max(this.maxX + PAD, minWidth),
      height: Math.max(this.maxY + PAD, minHeight),
      items: this.items,
      connectors: this.connectors,
    };
  }
}
