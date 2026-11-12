import type { BoardConnector, BoardFrame, BoardItem } from './types.js';
import { SWATCH, fillOf } from './palette.js';
import type { NodeKind } from './palette.js';

export const STICKY_W = 180;
export const STICKY_H = 80;
export const GAP = 20;
export const PAD = 32;
export const HEADER_H = 64;
const CHIP_H = 28;

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
  ) {}

  add(item: Omit<BoardItem, 'id'>): BoardItem {
    this.seq += 1;
    const full: BoardItem = { id: `${this.id}-${this.seq}`, ...item };
    this.items.push(full);
    this.maxX = Math.max(this.maxX, full.x + full.w);
    this.maxY = Math.max(this.maxY, full.y + full.h);
    return full;
  }

  /** Adds an item behind those added since `index`, so it reads as their container. */
  insertBehind(index: number, item: Omit<BoardItem, 'id'>): void {
    this.add(item);
    const [added] = this.items.splice(this.items.length - 1, 1);
    if (added) this.items.splice(index, 0, added);
  }

  node(kind: NodeKind, text: string, x: number, y: number, w = STICKY_W, h = STICKY_H): BoardItem {
    return this.add({ kind, text, x, y, w, h, fill: fillOf(kind) });
  }

  chip(text: string, x: number, y: number, w = STICKY_W): BoardItem {
    return this.add({ kind: 'chip', text, x, y, w, h: CHIP_H, fill: SWATCH.interface });
  }

  header(text: string, w: number): BoardItem {
    return this.add({
      kind: 'header',
      text,
      x: PAD,
      y: PAD,
      w,
      h: HEADER_H - PAD / 2,
      fill: SWATCH.moment,
    });
  }

  connect(from: BoardItem, to: BoardItem, label?: string, dashed?: boolean): void {
    const c: BoardConnector = { from: from.id, to: to.id };
    if (label !== undefined) c.label = label;
    if (dashed) c.dashed = true;
    this.connectors.push(c);
  }

  /** Lays stickies of one kind in rows of at most `cols`; returns the y below the last row. */
  grid(
    kind: NodeKind,
    entries: { text: string; chip?: string }[],
    x: number,
    y: number,
    cols = 5,
  ): number {
    let row = 0;
    entries.forEach((e, i) => {
      const col = i % cols;
      row = Math.floor(i / cols);
      const rowY = y + row * (STICKY_H + CHIP_H + GAP * 2);
      const cx = x + col * (STICKY_W + GAP);
      this.node(kind, e.text, cx, rowY);
      if (e.chip !== undefined) this.chip(e.chip, cx, rowY + STICKY_H + 4);
    });
    return entries.length === 0 ? y : y + (row + 1) * (STICKY_H + CHIP_H + GAP * 2);
  }

  build(minWidth = 0): BoardFrame {
    return {
      id: this.id,
      title: this.title,
      kind: this.kind,
      width: Math.max(this.maxX + PAD, minWidth),
      height: this.maxY + PAD,
      items: this.items,
      connectors: this.connectors,
    };
  }
}
