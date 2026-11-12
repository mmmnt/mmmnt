import type { BoardFrame, BoardItem } from './types.js';

const INK = '#1a1a1a';

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function itemSvg(item: BoardItem): string {
  const common = `id="${esc(item.id)}" x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}"`;
  switch (item.kind) {
    case 'container':
      return `<rect ${common} rx="6" fill="${item.fill}" stroke="${INK}" stroke-width="2" data-content="${esc(item.text)}" data-text-align="left" data-text-align-vertical="top" data-font-weight="bold" data-font-size="14" data-text-color="${INK}" />`;
    case 'header':
      return `<rect ${common} rx="6" fill="${item.fill}" stroke="none" data-content="${esc(item.text)}" data-font-weight="bold" data-font-size="14" data-text-color="${INK}" />`;
    case 'chip':
      return `<rect ${common} rx="14" fill="${item.fill}" stroke="${INK}" stroke-width="2" data-content="${esc(item.text)}" data-font-size="10" data-text-color="${INK}" />`;
    default:
      return `<rect ${common} rx="4" fill="${item.fill}" stroke="none" data-content="${esc(item.text)}" data-font-size="12" data-text-color="${INK}" />`;
  }
}

/** One Canvas Composer SVG for a frame: a single svg root, one data-frame group, shapes with hex fills. */
export function renderFrameSvg(frame: BoardFrame): string {
  const lines: string[] = [];
  lines.push('<svg xmlns="http://www.w3.org/2000/svg">');
  lines.push(
    `<g id="${esc(frame.id)}" transform="translate(0,0)" data-frame="${esc(frame.title)}">`,
  );
  lines.push(
    `<rect data-type="frame" x="0" y="0" width="${frame.width}" height="${frame.height}" fill="#ffffff" data-title="${esc(frame.title)}" />`,
  );
  for (const item of frame.items) lines.push(itemSvg(item));
  for (const c of frame.connectors) {
    const dash = c.dashed ? ' stroke-dasharray="5,5"' : '';
    const label = c.label === undefined ? '' : ` data-content="${esc(c.label)}"`;
    lines.push(
      `<line x1="0" y1="0" x2="0" y2="0" stroke="${INK}" stroke-width="2" data-arrow="end" data-shape="elbowed" data-start="${esc(c.from)}" data-end="${esc(c.to)}"${label}${dash} />`,
    );
  }
  lines.push('</g>');
  lines.push('</svg>');
  return lines.join('\n') + '\n';
}
