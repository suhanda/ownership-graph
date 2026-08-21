'use client';

import type { GraphLink, GraphNode, GraphPayload, NodeKind } from '@ownership/shared';
import { GraphChart } from 'echarts/charts';
import { LegendComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useTheme } from 'next-themes';
import { useEffect, useRef } from 'react';
import { KIND_STYLE, readToken } from './tokens';

echarts.use([GraphChart, CanvasRenderer, TooltipComponent, LegendComponent]);

/**
 * Edges are differentiated by hue, dash and weight — never by fading out. An earlier version drew
 * everything except OWNS in the `--border` token at 55% opacity, which measures 1.33:1 against the
 * card: invisible. Worse, on the hidden-link view those "context" edges are the entire finding.
 *
 * Only jurisdiction and citizenship recede, because they are Hubs: shared by everything, evidence
 * of nothing.
 */
const HUB_EDGES: ReadonlySet<string> = new Set(['REGISTERED_IN', 'CITIZEN_OF']);
const KINDS = Object.keys(KIND_STYLE) as NodeKind[];

export interface GraphCanvasProps {
  graph: GraphPayload;
  /** Drawn with a ring — the subject of the question. */
  focusIds?: string[];
  /** Single click: inspect. Fires only once a double-click can be ruled out. */
  onSelect?: (node: GraphNode) => void;
  /** Double click: pull this node's neighbours into the current graph. */
  onExpand?: (node: GraphNode) => void;
  /** How many other entities share a node, so link strength is judgeable. */
  shareCounts?: Record<string, number>;
}

export function GraphCanvas({
  graph,
  focusIds = [],
  onSelect,
  onExpand,
  shareCounts = {},
}: GraphCanvasProps) {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!container.current) return;
    chart.current = echarts.init(container.current, null, { renderer: 'canvas' });
    const onResize = () => chart.current?.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.current?.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = chart.current;
    if (!instance) return;

    // Tokens are read at paint time so a theme change repaints with the new palette, rather than
    // keeping the colours ECharts captured on first render.
    const ink = readToken('--foreground');
    const muted = readToken('--muted-foreground');
    const line = readToken('--border');
    const surface = readToken('--card');
    const primary = readToken('--primary');
    const ochre = readToken('--chart-2');
    const risk = readToken('--chart-3');
    const focus = new Set(focusIds);

    // Above this, per-edge percentages and long labels stop being readable and start being noise.
    const dense = graph.nodes.length > 14 || graph.links.length > 18;

    // Categories give ECharts the legend for free, and colour follows the node's kind.
    const categories = KINDS.map((kind) => ({
      name: kind,
      itemStyle: { color: readToken(KIND_STYLE[kind].token) },
      symbol: KIND_STYLE[kind].symbol,
    }));

    const nodes = graph.nodes.map((node) => {
      const style = KIND_STYLE[node.kind];
      const ringed = focus.has(node.id) || node.watchlisted === true;
      return {
        id: node.id,
        // `name` is what the label and legend show, so it carries the human-readable text.
        name: node.label,
        category: Math.max(KINDS.indexOf(node.kind), 0),
        symbol: style.symbol,
        symbolSize: focus.has(node.id) ? style.size * 1.25 : style.size,
        itemStyle: {
          borderColor: node.watchlisted === true ? risk : surface,
          borderWidth: ringed ? 3 : 1,
        },
        label: {
          show: !dense || focus.has(node.id) || node.watchlisted === true,
          fontWeight: ringed ? (700 as const) : (400 as const),
        },
        __node: node,
        __shared: shareCounts[node.id],
      };
    });

    const edgeStyle = (
      type: string,
    ): { color: string; width: number; opacity: number; dashed: boolean } => {
      if (type === 'OWNS') return { color: primary, width: 2.4, opacity: 1, dashed: false };
      // A nominee is the gap between the registered and the real owner — dashed reads as indirect.
      if (type === 'NOMINEE_FOR') return { color: ochre, width: 2.2, opacity: 1, dashed: true };
      if (HUB_EDGES.has(type)) return { color: muted, width: 1, opacity: 0.35, dashed: false };
      // Shared address, agent, officer: on the hidden-link question these carry the answer.
      return { color: muted, width: 1.8, opacity: 0.85, dashed: false };
    };

    const links = graph.links.map((link: GraphLink) => {
      const style = edgeStyle(link.type);
      return {
        source: link.source,
        target: link.target,
        label: {
          show: !dense && link.pct !== undefined && link.pct !== null,
          formatter: () => `${Math.round((link.pct ?? 0) * 100)}%`,
          fontSize: 11,
          fontFamily: 'var(--font-mono), monospace',
          color: ink,
          backgroundColor: surface,
          padding: [1, 3] as [number, number],
          borderRadius: 3,
        },
        lineStyle: {
          color: style.color,
          width: style.width,
          opacity: style.opacity,
          curveness: 0,
          type: style.dashed ? ('dashed' as const) : ('solid' as const),
        },
        __type: link.type,
      };
    });

    instance.setOption(
      {
        backgroundColor: 'transparent',
        // The force simulation animates itself; chart-level animation fights it.
        animation: false,
        legend: {
          data: KINDS,
          bottom: 8,
          left: 12,
          orient: 'horizontal',
          itemGap: 14,
          textStyle: { color: muted, fontSize: 11, fontFamily: 'var(--font-sans), sans-serif' },
          inactiveColor: line,
        },
        tooltip: {
          backgroundColor: surface,
          borderColor: line,
          borderWidth: 1,
          textStyle: { color: ink, fontSize: 12, fontFamily: 'var(--font-sans), sans-serif' },
          extraCssText: 'border-radius:6px;padding:8px 10px;box-shadow:0 8px 24px -12px #0f172340',
          formatter: (p: { dataType?: string; data?: unknown }) => {
            const data = p.data as Record<string, unknown> | undefined;
            if (p.dataType === 'edge') {
              return `<b>${String(data?.['__type'] ?? '')
                .replace(/_/g, ' ')
                .toLowerCase()}</b>`;
            }
            const node = data?.['__node'] as GraphNode | undefined;
            if (!node) return '';
            const bits = [KIND_STYLE[node.kind].role, node.legalForm, node.jurisdictionCode].filter(
              Boolean,
            );
            const shared = data?.['__shared'];
            const sharedLine =
              typeof shared === 'number'
                ? `<br><span style="color:${muted}">shared by ${shared} entities</span>`
                : '';
            return `<b>${node.label}</b><br><span style="color:${muted}">${bits.join(' · ')}</span>${sharedLine}`;
          },
        },
        series: [
          {
            type: 'graph',
            layout: 'force',
            // No x/y is deliberate. Seeding coordinates into the simulation collapses it — the
            // reference example (graph-webkit-dep) passes none, and the layout solves placement.
            force: {
              // Scaled to node count: values that suit a 1,500-node dependency graph pack a
              // 20-node answer into an unreadable clump.
              repulsion: dense ? 320 : 220,
              edgeLength: dense ? 110 : 90,
              gravity: 0.12,
            },
            roam: true,
            draggable: true,
            scaleLimit: { min: 0.4, max: 6 },
            label: {
              position: 'right',
              formatter: '{b}',
              color: ink,
              fontSize: 12,
              fontFamily: 'var(--font-sans), sans-serif',
            },
            labelLayout: { hideOverlap: true },
            emphasis: { focus: 'adjacency' as const, label: { show: true } },
            edgeSymbol: ['none', 'arrow'],
            edgeSymbolSize: 8,
            categories,
            data: nodes,
            edges: links,
          },
        ],
      },
      true,
    );
    instance.resize();
  }, [graph, focusIds, shareCounts, resolvedTheme]);

  useEffect(() => {
    const instance = chart.current;
    if (!instance) return;

    const nodeOf = (p: { dataType?: string; data?: unknown }): GraphNode | undefined => {
      if (p.dataType === 'edge') return undefined;
      return (p.data as Record<string, unknown> | undefined)?.['__node'] as GraphNode | undefined;
    };

    // ECharts fires `click` before `dblclick`, so a bare click handler would run on the first half
    // of every double-click. Hold the single-click briefly and drop it if a second click lands.
    let pending: ReturnType<typeof setTimeout> | null = null;
    const clearPending = () => {
      if (pending) clearTimeout(pending);
      pending = null;
    };

    const onClick = (p: { dataType?: string; data?: unknown }): void => {
      const node = nodeOf(p);
      if (!node || !onSelect) return;
      clearPending();
      pending = setTimeout(() => {
        pending = null;
        onSelect(node);
      }, 220);
    };

    const onDoubleClick = (p: { dataType?: string; data?: unknown }): void => {
      const node = nodeOf(p);
      clearPending();
      if (node && onExpand) onExpand(node);
    };

    instance.on('click', onClick);
    instance.on('dblclick', onDoubleClick);
    return () => {
      clearPending();
      instance.off('click', onClick);
      instance.off('dblclick', onDoubleClick);
    };
  }, [onSelect, onExpand]);

  return (
    <div
      ref={container}
      className="absolute inset-0"
      role="img"
      aria-label="Ownership network diagram"
    />
  );
}
