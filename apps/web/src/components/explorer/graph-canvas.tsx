'use client';

import type { GraphLink } from '@ownership/shared';
import * as echarts from 'echarts/core';
import { GraphChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
import { TooltipComponent } from 'echarts/components';
import { useTheme } from 'next-themes';
import { useEffect, useRef } from 'react';
import type { PositionedGraph, PositionedNode } from '@/lib/layout';
import { KIND_STYLE, readToken } from './tokens';

echarts.use([GraphChart, CanvasRenderer, TooltipComponent]);

/** Ownership edges are the argument; everything else is context and recedes. */
const EMPHASISED: ReadonlySet<string> = new Set(['OWNS', 'NOMINEE_FOR']);

const truncate = (text: string, max = 30) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

export interface GraphCanvasProps {
  graph: PositionedGraph;
  /** Nodes drawn with a ring — the subject of the question, and anything on a watchlist. */
  focusIds?: string[];
  onSelect?: (node: PositionedNode) => void;
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

    // Tokens are read at paint time, so a theme change repaints with the new palette rather than
    // keeping the colours ECharts captured on first render.
    const ink = readToken('--foreground');
    const muted = readToken('--muted-foreground');
    const line = readToken('--border');
    const surface = readToken('--card');
    const risk = readToken('--chart-3');
    const focus = new Set(focusIds);

    const nodes = graph.nodes.map((node) => {
      const style = KIND_STYLE[node.kind];
      const colour = readToken(style.token);
      const ringed = focus.has(node.id) || node.watchlisted === true;
      const shared = shareCounts[node.id];
      return {
        id: node.id,
        name: node.id,
        // Seed only: with layout 'force' these are the simulation's starting coordinates, so it
        // relaxes out of a sensible ranking rather than out of noise.
        x: node.x,
        y: node.y,
        symbol: style.symbol,
        symbolSize: style.size,
        itemStyle: {
          color: colour,
          borderColor: node.watchlisted === true ? risk : surface,
          borderWidth: ringed ? 3 : 1.5,
        },
        label: {
          show: true,
          // Below and centred, not to the right: a right-hand label runs into the next node in the
          // row, which is what turned dense results into a wall of overlapping text.
          position: 'bottom' as const,
          distance: 8,
          width: 150,
          overflow: 'truncate' as const,
          formatter: () => truncate(node.label, graph.dense ? 18 : 26),
          color: ink,
          fontSize: 12,
          fontWeight: focus.has(node.id) ? (600 as const) : (500 as const),
          fontFamily: 'var(--font-sans), sans-serif',
        },
        __node: node,
        __shared: shared,
      };
    });

    const links = graph.links.map((link: GraphLink) => {
      const strong = EMPHASISED.has(link.type);
      return {
        source: link.source,
        target: link.target,
        label: {
          show: !graph.dense && link.pct !== undefined && link.pct !== null,
          formatter: () => `${Math.round((link.pct ?? 0) * 100)}%`,
          fontSize: 11,
          fontFamily: 'var(--font-mono), monospace',
          color: muted,
          backgroundColor: surface,
          padding: [2, 4] as [number, number],
          borderRadius: 3,
        },
        lineStyle: {
          color: strong ? readToken('--primary') : line,
          width: strong ? 2.2 : 1.5,
          opacity: strong ? 0.95 : 0.7,
          type: link.type === 'NOMINEE_FOR' ? ('dashed' as const) : ('solid' as const),
          curveness: 0,
        },
        symbol: ['none', 'arrow'] as [string, string],
        symbolSize: 7,
        __type: link.type,
      };
    });

    instance.setOption(
      {
        backgroundColor: 'transparent',
        animationDuration: 420,
        animationEasing: 'cubicOut' as const,
        tooltip: {
          backgroundColor: surface,
          borderColor: line,
          borderWidth: 1,
          textStyle: { color: ink, fontSize: 12, fontFamily: 'var(--font-sans), sans-serif' },
          extraCssText: 'border-radius:6px;padding:8px 10px;box-shadow:0 8px 24px -12px #0f172340',
          formatter: (p: { dataType?: string; data?: Record<string, unknown> }) => {
            if (p.dataType === 'edge') {
              const type = String(p.data?.['__type'] ?? '')
                .replace(/_/g, ' ')
                .toLowerCase();
              return `<b>${type}</b>`;
            }
            const node = p.data?.['__node'] as PositionedNode | undefined;
            if (!node) return '';
            const bits = [KIND_STYLE[node.kind].role, node.legalForm, node.jurisdictionCode].filter(
              Boolean,
            );
            const shared = p.data?.['__shared'];
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
            // Seeded from the layered ranking (see lib/layout.ts) and then relaxed. Repulsion is
            // set high enough that labels do not collide; edgeLength stays short so ownership
            // chains read as chains rather than drifting apart.
            force: {
              initLayout: undefined,
              repulsion: graph.dense ? 420 : 300,
              edgeLength: graph.dense ? [90, 150] : [110, 170],
              gravity: 0.08,
              friction: 0.2,
              layoutAnimation: true,
            },
            roam: true,
            draggable: true,
            left: 60,
            right: 60,
            top: 50,
            bottom: 60,
            edgeSymbolSize: 8,
            emphasis: { focus: 'adjacency' as const, scale: false },
            data: nodes,
            links,
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
      const node = data?.['__node'] as PositionedNode | undefined;
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
