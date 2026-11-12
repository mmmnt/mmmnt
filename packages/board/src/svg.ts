import type { BoardFrame, BoardItem, Placement } from './types.js';

const INK = '#1a1a1a';

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** An attribute value that carries `<br>` for line breaks, as data-content accepts. */
const content = (text: string): string => esc(text).replace(/\n/g, '&lt;br&gt;');

function stickySvg(i: BoardItem, geom: string): string {
  const color = i.color === undefined ? '' : ` data-color="${i.color}"`;
  return `<rect id="${esc(i.id)}" data-type="sticky" ${geom}${color} data-content="${content(i.text)}" />`;
}

function shapeSvg(i: BoardItem, geom: string): string {
  const stroke = i.outlined ? ` stroke="${INK}" stroke-width="2"` : ' stroke="none"';
  const size = ` data-font-size="${i.fontSize ?? 14}"`;
  const weight = i.bold ? ' data-font-weight="bold"' : '';
  const align =
    i.outlined && i.kind === 'container'
      ? ' data-text-align="left" data-text-align-vertical="top"'
      : '';
  const color = ` data-text-color="${i.textColor ?? INK}"`;
  return `<rect id="${esc(i.id)}" ${geom} rx="6" fill="${i.fill}"${stroke}${size}${weight}${align}${color} data-content="${content(i.text)}" />`;
}

function textSvg(i: BoardItem): string {
  const body = esc(i.text).replace(/\n/g, '<br/>');
  const inner = i.bold ? `<b>${body}</b>` : body;
  return `<textArea id="${esc(i.id)}" x="${i.x}" y="${i.y}" width="${i.w}" font-size="${i.fontSize ?? 14}" fill="${i.fill}">${inner}</textArea>`;
}

function itemSvg(i: BoardItem): string {
  const geom = `x="${i.x}" y="${i.y}" width="${i.w}" height="${i.h}"`;
  if (i.widget === 'sticky') return stickySvg(i, geom);
  if (i.widget === 'text') return textSvg(i);
  return shapeSvg(i, geom);
}

function frameGroup(frame: BoardFrame, at: { x: number; y: number }): string[] {
  const lines = [
    `<g id="${esc(frame.id)}" transform="translate(${at.x},${at.y})" data-frame="${esc(frame.title)}">`,
  ];
  lines.push(
    `<rect data-type="frame" x="0" y="0" width="${frame.width}" height="${frame.height}" fill="#ffffff" data-title="${esc(frame.title)}" />`,
  );
  for (const item of frame.items) lines.push(itemSvg(item));
  for (const c of frame.connectors) {
    const dash = c.dashed ? ' stroke-dasharray="5,5"' : '';
    const label = c.label === undefined ? '' : ` data-content="${esc(c.label)}"`;
    const shape = ` data-shape="${c.shape ?? 'straight'}"`;
    lines.push(
      `<line x1="0" y1="0" x2="0" y2="0" stroke="#313131" stroke-width="2" data-arrow="end"${shape} data-start="${esc(c.from)}" data-end="${esc(c.to)}"${label}${dash} />`,
    );
  }
  lines.push('</g>');
  return lines;
}

/** One Canvas Composer SVG for a frame, at its own origin or at a place on the board. */
export function renderFrameSvg(
  frame: BoardFrame,
  at: Pick<Placement, 'x' | 'y'> = { x: 0, y: 0 },
): string {
  return (
    ['<svg xmlns="http://www.w3.org/2000/svg">', ...frameGroup(frame, at), '</svg>'].join('\n') +
    '\n'
  );
}

/** Every frame at its place on the board grid, under one svg root. */
export function renderBoardSvg(frames: BoardFrame[], places: Map<string, Placement>): string {
  const groups = frames.flatMap((f) => frameGroup(f, places.get(f.id) ?? { x: 0, y: 0 }));
  return ['<svg xmlns="http://www.w3.org/2000/svg">', ...groups, '</svg>'].join('\n') + '\n';
}
