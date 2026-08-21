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

/** Ownership and nominee edges carry the argument; the rest is context and recedes. */
const EMPHASISED: ReadonlySet<string> = new Set(['OWNS', 'NOMINEE_FOR']);
const KINDS = Object.keys(KIND_STYLE) as NodeKind[];

export interface GraphCanvasProps {
  graph: GraphPayload;
  /** Drawn with a ring — the subject of the question. */
  focusIds?: string[];
  onSelect?: (node: GraphNode) => void;
  /** How many other entities share a node, so link strength is judgeable. */
  shareCounts?: Record<string, number>;
}

export function GraphCanvas({
  graph,
  focusIds = [],
  onSelect,
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

    const links = graph.links.map((link: GraphLink) => {
      const strong = EMPHASISED.has(link.type);
      return {
        source: link.source,
        target: link.target,
        label: {
          show: !dense && link.pct !== undefined && link.pct !== null,
          formatter: () => `${Math.round((link.pct ?? 0) * 100)}%`,
          fontSize: 11,
          fontFamily: 'var(--font-mono), monospace',
          color: muted,
        },
        lineStyle: {
          color: strong ? primary : line,
          width: strong ? 2 : 1,
          opacity: strong ? 0.9 : 0.55,
          curveness: 0,
          type: link.type === 'NOMINEE_FOR' ? ('dashed' as const) : ('solid' as const),
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
            edgeSymbolSize: 7,
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
    if (!instance || !onSelect) return;
    const handler = (p: { dataType?: string; data?: unknown }): void => {
      const data = p.data as Record<string, unknown> | undefined;
      const node = data?.['__node'] as GraphNode | undefined;
      if (p.dataType !== 'edge' && node) onSelect(node);
    };
    instance.on('click', handler);
    return () => {
      instance.off('click', handler);
    };
  }, [onSelect]);

  return (
    <div
      ref={container}
      className="absolute inset-0"
      role="img"
      aria-label="Ownership network diagram"
    />
  );
}
