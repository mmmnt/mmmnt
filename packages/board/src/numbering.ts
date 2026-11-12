/**
 * Numbers of flows, moments, arms and contexts (ADR-048 D7). The id lives in the model text; the
 * prefix letters are read from it and never fixed here.
 */

export class BoardNumberingError extends Error {
  constructor(
    message: string,
    readonly flows: string[],
  ) {
    super(message);
    this.name = 'BoardNumberingError';
  }
}

const SEPARATOR = '\\s*[-\u2013\u2014\u00b7:]\\s*';
const FLOW_TOKEN = new RegExp(`^([A-Za-z]+)(\\d+)${SEPARATOR}(.+)$`, 's');
const MOMENT_TOKEN = new RegExp(`^([A-Za-z]+\\d+\\.[A-Za-z]+\\d+)${SEPARATOR}(.+)$`, 's');
const CONTEXT_TOKEN = /^[Cc](\d+)[-_ ]/;

export interface FlowNumber {
  id: string;
  prefix: string;
  n: number;
  title: string;
}

/** The id token of a flow name, or undefined when the flow has none. */
export function numberFlow(name: string): FlowNumber | undefined {
  const m = FLOW_TOKEN.exec(name.trim());
  if (!m) return undefined;
  return { id: `${m[1]}${m[2]}`, prefix: m[1]!, n: Number(m[2]), title: m[3]!.trim() };
}

export interface MomentNumber {
  id: string;
  title: string;
  source: 'name' | 'position';
}

interface FlowLike {
  name: string;
  moments: { name: string }[];
}

export interface NumberedFlow extends FlowNumber {
  moments: MomentNumber[];
}

function numberMoments(flow: FlowLike, flowId: string): MomentNumber[] {
  return flow.moments.map((m, i) => {
    const hit = MOMENT_TOKEN.exec(m.name.trim());
    if (hit) return { id: hit[1]!, title: hit[2]!.trim(), source: 'name' };
    return { id: `${flowId}.M${i + 1}`, title: m.name, source: 'position' };
  });
}

/** Numbers every flow, or throws naming the flows that have no id or share one. */
export function numberFlows(flows: FlowLike[]): NumberedFlow[] {
  const missing = flows.filter((f) => numberFlow(f.name) === undefined).map((f) => f.name);
  if (missing.length > 0) {
    throw new BoardNumberingError(
      `A flow needs an id token in its name (for example "N1 - Title"); no id: ${missing.join('; ')}`,
      missing,
    );
  }
  const numbered = flows.map((f) => {
    const n = numberFlow(f.name)!;
    return { ...n, moments: numberMoments(f, n.id) };
  });
  const seen = new Map<string, string>();
  for (const f of numbered) {
    const other = seen.get(f.id);
    if (other !== undefined) {
      throw new BoardNumberingError(`Two flows share the id ${f.id}: ${other}; ${f.title}`, [
        other,
        f.title,
      ]);
    }
    seen.set(f.id, f.title);
  }
  return numbered;
}

export interface ContextNumber {
  name: string;
  number: string;
  source: 'name' | 'manifest' | 'load-order';
}

/** C<i> from a name token, else the position in the manifest order, else the load order. */
export function numberContexts(names: string[], manifestOrder?: string[]): ContextNumber[] {
  const order = manifestOrder ?? [];
  const rest = names.filter((n) => !order.includes(n));
  return names.map((name) => {
    const token = CONTEXT_TOKEN.exec(name);
    if (token) return { name, number: `C${token[1]}`, source: 'name' as const };
    const inManifest = order.indexOf(name);
    if (inManifest >= 0) return { name, number: `C${inManifest + 1}`, source: 'manifest' as const };
    return {
      name,
      number: `C${order.length + rest.indexOf(name) + 1}`,
      source: 'load-order' as const,
    };
  });
}

/** `<moment id>-B<i>` for each arm, the empty main-path arm uncounted. */
export function armIds(momentId: string, arms: { entries: unknown[] }[]): (string | undefined)[] {
  let i = 0;
  return arms.map((arm, k) => {
    if (k === 0 && arm.entries.length === 0) return undefined;
    i += 1;
    return `${momentId}-B${i}`;
  });
}
