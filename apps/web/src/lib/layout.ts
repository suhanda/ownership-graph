import type { GraphLink, GraphNode, GraphPayload } from '@ownership/shared';

export interface PositionedNode extends GraphNode {
  x: number;
  y: number;
}
export interface PositionedGraph {
  nodes: PositionedNode[];
  links: GraphLink[];
}

/**
 * Ownership has direction and depth, and that is the whole point of the picture. A force layout
 * scrambles exactly what the reader is trying to see, so positions are computed instead:
 * the subject sits at the bottom and each ownership layer stacks above it.
 */
const COLUMN = 210;
const ROW = 108;

function rankFromRoot(links: GraphLink[], rootId: string): Map<string, number> {
  // Walk *up* the ownership edges: an owner of the root is one layer above it.
  const owners = new Map<string, string[]>();
  for (const link of links) {
    const list = owners.get(link.target) ?? [];
    list.push(link.source);
    owners.set(link.target, list);
  }
  const rank = new Map<string, number>([[rootId, 0]]);
  const queue: string[] = [rootId];
  while (queue.length) {
    const id = queue.shift();
    if (id === undefined) break;
    const depth = rank.get(id) ?? 0;
    for (const owner of owners.get(id) ?? []) {
      // keep the deepest rank, so a node reachable by two chains sits above both
      if (!rank.has(owner) || (rank.get(owner) ?? 0) < depth + 1) {
        rank.set(owner, depth + 1);
        queue.push(owner);
      }
    }
  }
  return rank;
}

function place(nodes: GraphNode[], rank: Map<string, number>): PositionedNode[] {
  const rows = new Map<number, GraphNode[]>();
  let unranked = 0;
  for (const node of nodes) {
    const r = rank.get(node.id) ?? -1 - unranked++;
    const group = rows.get(r);
    if (group) group.push(node);
    else rows.set(r, [node]);
  }
  const maxRank = Math.max(...[...rows.keys()], 0);
  const placed: PositionedNode[] = [];
  for (const [r, group] of rows) {
    const width = (group.length - 1) * COLUMN;
    group.forEach((node, i) => {
      placed.push({ ...node, x: i * COLUMN - width / 2, y: (maxRank - r) * ROW });
    });
  }
  return placed;
}

/** Subject at the bottom, owners stacked above. Used by the ownership and watchlist answers. */
export function layered(payload: GraphPayload, rootId: string): PositionedGraph {
  return { nodes: place(payload.nodes, rankFromRoot(payload.links, rootId)), links: payload.links };
}

/**
 * Two subjects at the edges with whatever connects them down the middle — the shape that makes a
 * hidden link legible at a glance.
 */
export function bridged(payload: GraphPayload, fromId: string, toId: string): PositionedGraph {
  const ends = new Set([fromId, toId]);
  const middle = payload.nodes.filter((n) => !ends.has(n.id));
  const span = Math.max((middle.length - 1) * ROW, 0);
  const nodes: PositionedNode[] = payload.nodes.map((node) => {
    if (node.id === fromId) return { ...node, x: -COLUMN * 1.6, y: span / 2 };
    if (node.id === toId) return { ...node, x: COLUMN * 1.6, y: span / 2 };
    const index = middle.findIndex((m) => m.id === node.id);
    return { ...node, x: 0, y: index * ROW };
  });
  return { nodes, links: payload.links };
}

/** A closed ring, drawn as one — the shape is the finding. */
export function ring(payload: GraphPayload): PositionedGraph {
  const radius = Math.max(120, payload.nodes.length * 34);
  const nodes = payload.nodes.map((node, i) => {
    const angle = (i / payload.nodes.length) * Math.PI * 2 - Math.PI / 2;
    return { ...node, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
  return { nodes, links: payload.links };
}

/** One node at the centre, its neighbours around it. */
export function radial(payload: GraphPayload, centreId: string): PositionedGraph {
  const others = payload.nodes.filter((n) => n.id !== centreId);
  const radius = Math.max(150, others.length * 26);
  const nodes: PositionedNode[] = payload.nodes.map((node) => {
    if (node.id === centreId) return { ...node, x: 0, y: 0 };
    const index = others.findIndex((o) => o.id === node.id);
    const angle = (index / Math.max(others.length, 1)) * Math.PI * 2 - Math.PI / 2;
    return { ...node, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
  return { nodes, links: payload.links };
}
