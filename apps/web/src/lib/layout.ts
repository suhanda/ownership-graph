import type { GraphLink, GraphNode, GraphPayload } from '@ownership/shared';

export interface PositionedNode extends GraphNode {
  x: number;
  y: number;
}
export interface PositionedGraph {
  nodes: PositionedNode[];
  links: GraphLink[];
  /** True when the result is dense enough that per-edge labels would be noise. */
  dense: boolean;
}

/**
 * Positions here are **seeds**, not final coordinates. The chart runs ECharts' force layout and uses
 * them as starting points, so the simulation settles out of a meaningful ranking instead of a random
 * scatter — which keeps ownership roughly top-down without the width blow-up a fixed layout gives on
 * a row of fifteen nodes.
 */

const ROW = 132;
const MIN_COLUMN = 168;
const MAX_WIDTH = 2400;

const dense = (payload: GraphPayload): boolean =>
  payload.nodes.length > 14 || payload.links.length > 18;

/**
 * Longest-path layering (the ranking step of a Sugiyama layout). A node sits one row above the
 * lowest thing it owns, so ownership always reads downward and every node gets a rank — including
 * the ones an earlier BFS-from-one-root left stranded, which is what made dense results pile up.
 */
function rank(nodes: GraphNode[], links: GraphLink[]): Map<string, number> {
  const children = new Map<string, string[]>();
  const present = new Set(nodes.map((n) => n.id));
  for (const link of links) {
    if (!present.has(link.source) || !present.has(link.target)) continue;
    const list = children.get(link.source);
    if (list) list.push(link.target);
    else children.set(link.source, [link.target]);
  }

  const ranks = new Map<string, number>();
  const visiting = new Set<string>();

  const depthOf = (id: string): number => {
    const cached = ranks.get(id);
    if (cached !== undefined) return cached;
    // A planted ownership cycle would recurse forever; treat the back edge as the bottom.
    if (visiting.has(id)) return 0;
    visiting.add(id);
    let depth = 0;
    for (const child of children.get(id) ?? []) depth = Math.max(depth, depthOf(child) + 1);
    visiting.delete(id);
    ranks.set(id, depth);
    return depth;
  };

  for (const node of nodes) depthOf(node.id);
  return ranks;
}

/**
 * Barycentre ordering: place each node near the average position of what it connects to on the row
 * below, then sweep back upward. Two passes removes most crossings, which is the difference between
 * a readable chain and a ball of string.
 */
function order(rows: Map<number, GraphNode[]>, links: GraphLink[]): void {
  const neighbours = new Map<string, string[]>();
  const add = (a: string, b: string) => {
    const list = neighbours.get(a);
    if (list) list.push(b);
    else neighbours.set(a, [b]);
  };
  for (const link of links) {
    add(link.source, link.target);
    add(link.target, link.source);
  }

  const indexIn = (row: GraphNode[] | undefined, id: string) =>
    row?.findIndex((n) => n.id === id) ?? -1;
  const ranksAsc = [...rows.keys()].sort((a, b) => a - b);

  for (const direction of [1, -1]) {
    const sweep = direction === 1 ? ranksAsc : [...ranksAsc].reverse();
    for (const r of sweep) {
      const row = rows.get(r);
      const reference = rows.get(r - direction);
      if (!row || !reference) continue;
      const barycentre = new Map<string, number>();
      for (const node of row) {
        const positions = (neighbours.get(node.id) ?? [])
          .map((id) => indexIn(reference, id))
          .filter((i) => i >= 0);
        barycentre.set(
          node.id,
          positions.length
            ? positions.reduce((a, b) => a + b, 0) / positions.length
            : Number.MAX_SAFE_INTEGER,
        );
      }
      row.sort((a, b) => (barycentre.get(a.id) ?? 0) - (barycentre.get(b.id) ?? 0));
    }
  }
}

function toRows(nodes: GraphNode[], ranks: Map<string, number>): Map<number, GraphNode[]> {
  const rows = new Map<number, GraphNode[]>();
  for (const node of nodes) {
    const r = ranks.get(node.id) ?? 0;
    const row = rows.get(r);
    if (row) row.push(node);
    else rows.set(r, [node]);
  }
  return rows;
}

/** Ownership reads downward: owners above, the thing owned at the bottom. */
export function layered(payload: GraphPayload): PositionedGraph {
  const ranks = rank(payload.nodes, payload.links);
  const rows = toRows(payload.nodes, ranks);
  order(rows, payload.links);

  const widest = Math.max(...[...rows.values()].map((r) => r.length), 1);
  // Squeeze the columns rather than run off the canvas, but never below a legible minimum.
  const column = Math.max(MIN_COLUMN, Math.min(260, MAX_WIDTH / widest));
  const maxRank = Math.max(...rows.keys(), 0);

  const placed: PositionedNode[] = [];
  for (const [r, group] of rows) {
    const width = (group.length - 1) * column;
    group.forEach((node, i) => {
      placed.push({ ...node, x: i * column - width / 2, y: (maxRank - r) * ROW });
    });
  }
  return { nodes: placed, links: payload.links, dense: dense(payload) };
}

/** Two subjects at the edges, whatever connects them stacked down the middle. */
export function bridged(payload: GraphPayload, fromId: string, toId: string): PositionedGraph {
  const ends = new Set([fromId, toId]);
  const middle = payload.nodes.filter((n) => !ends.has(n.id));
  const span = Math.max((middle.length - 1) * ROW, 0);
  const nodes: PositionedNode[] = payload.nodes.map((node) => {
    if (node.id === fromId) return { ...node, x: -380, y: span / 2 };
    if (node.id === toId) return { ...node, x: 380, y: span / 2 };
    const index = middle.findIndex((m) => m.id === node.id);
    return { ...node, x: 0, y: index * ROW };
  });
  return { nodes, links: payload.links, dense: dense(payload) };
}

/** A closed ring, drawn as one — the shape is the finding. */
export function ring(payload: GraphPayload): PositionedGraph {
  const radius = Math.max(150, payload.nodes.length * 40);
  const nodes = payload.nodes.map((node, i) => {
    const angle = (i / payload.nodes.length) * Math.PI * 2 - Math.PI / 2;
    return { ...node, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
  return { nodes, links: payload.links, dense: dense(payload) };
}

/** One node centred, its neighbours on a ring around it — spread wider as the count grows. */
export function radial(payload: GraphPayload, centreId: string): PositionedGraph {
  const others = payload.nodes.filter((n) => n.id !== centreId);
  const radius = Math.max(190, others.length * 30);
  const nodes: PositionedNode[] = payload.nodes.map((node) => {
    if (node.id === centreId) return { ...node, x: 0, y: 0 };
    const index = others.findIndex((o) => o.id === node.id);
    const angle = (index / Math.max(others.length, 1)) * Math.PI * 2 - Math.PI / 2;
    return { ...node, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
  return { nodes, links: payload.links, dense: dense(payload) };
}
