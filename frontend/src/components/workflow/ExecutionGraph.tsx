/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { alpha, Box, Stack, Tooltip, Typography, useTheme } from '@wso2/oxygen-ui';
import type { ExecutionGraph, ExecutionGraphEdge, ExecutionGraphNode } from '../../api/workflows';
import { humanizeKey, splitQualifiedName } from './helpers';
import { iconForType, paletteColor, statusColorName, typeLabel } from './graphVisuals';

// ── Layout constants (px). The graph flows left→right, one column per dependency layer. ──
const NODE_W = 220;
const NODE_H = 66;
const COL_GAP = 76; // horizontal space between layers
const ROW_GAP = 26; // vertical space between nodes within a layer
const PAD = 24; // canvas padding around the node block

interface PositionedNode extends ExecutionGraphNode {
  x: number;
  y: number;
}

interface Layout {
  nodes: PositionedNode[];
  edges: ExecutionGraphEdge[];
  width: number;
  height: number;
}

/**
 * Lays a DAG out into left→right columns using longest-path layering, then orders nodes within each
 * column by the barycenter (mean position) of their already-placed predecessors to reduce edge
 * crossings. Cyclic/unreachable nodes (a DAG shouldn't have them) fall back to column 0 so nothing
 * is dropped. Columns are vertically centred against the tallest one.
 */
function layoutDag(graph: ExecutionGraph): Layout {
  const nodes = graph.nodes ?? [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = (graph.edges ?? []).filter((e) => byId.has(e.source) && byId.has(e.target));

  const succ = new Map<string, string[]>();
  const preds = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  nodes.forEach((n) => {
    succ.set(n.id, []);
    preds.set(n.id, []);
    indeg.set(n.id, 0);
  });
  edges.forEach((e) => {
    succ.get(e.source)!.push(e.target);
    preds.get(e.target)!.push(e.source);
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  });

  // Longest-path layering via Kahn's algorithm: a node sits one column right of its deepest parent.
  const layer = new Map<string, number>();
  const remaining = new Map(indeg);
  const queue = nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  queue.forEach((id) => layer.set(id, 0));
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head];
    const next = (layer.get(id) ?? 0) + 1;
    for (const t of succ.get(id) ?? []) {
      layer.set(t, Math.max(layer.get(t) ?? 0, next));
      remaining.set(t, (remaining.get(t) ?? 0) - 1);
      if ((remaining.get(t) ?? 0) === 0) queue.push(t);
    }
  }
  nodes.forEach((n) => {
    if (!layer.has(n.id)) layer.set(n.id, 0); // cycle guard: never drop a node
  });

  // Group by column, preserving input order as the initial within-column order.
  const columns = new Map<number, string[]>();
  nodes.forEach((n) => {
    const l = layer.get(n.id)!;
    (columns.get(l) ?? columns.set(l, []).get(l)!).push(n.id);
  });
  const maxLayer = Math.max(0, ...columns.keys());

  // Barycenter ordering, sweeping left→right so each column sees final positions of the previous ones.
  const order = new Map<string, number>();
  for (let l = 0; l <= maxLayer; l++) {
    let ids = columns.get(l) ?? [];
    if (l > 0) {
      ids = ids
        .map((id, i) => {
          const ps = preds.get(id) ?? [];
          const placed = ps.map((p) => order.get(p)).filter((v): v is number => v !== undefined);
          const bary = placed.length ? placed.reduce((s, v) => s + v, 0) / placed.length : i;
          return { id, bary, i };
        })
        .sort((a, b) => a.bary - b.bary || a.i - b.i)
        .map((o) => o.id);
      columns.set(l, ids);
    }
    ids.forEach((id, i) => order.set(id, i));
  }

  const colHeight = (count: number) => count * NODE_H + Math.max(0, count - 1) * ROW_GAP;
  const maxColHeight = Math.max(0, ...[...columns.values()].map((ids) => colHeight(ids.length)));

  const positioned: PositionedNode[] = [];
  for (let l = 0; l <= maxLayer; l++) {
    const ids = columns.get(l) ?? [];
    const yOffset = (maxColHeight - colHeight(ids.length)) / 2;
    ids.forEach((id, i) => {
      positioned.push({
        ...byId.get(id)!,
        x: PAD + l * (NODE_W + COL_GAP),
        y: PAD + yOffset + i * (NODE_H + ROW_GAP),
      });
    });
  }

  return {
    nodes: positioned,
    edges,
    width: PAD * 2 + maxLayer * (NODE_W + COL_GAP) + NODE_W,
    height: PAD * 2 + maxColHeight,
  };
}

/** Cubic-bezier path from the right edge of the source node to the left edge of the target. */
function edgePath(s: PositionedNode, t: PositionedNode): string {
  const sx = s.x + NODE_W;
  const sy = s.y + NODE_H / 2;
  const tx = t.x;
  const ty = t.y + NODE_H / 2;
  const dx = Math.max(COL_GAP * 0.6, (tx - sx) * 0.5);
  return `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`;
}

function GraphNodeCard({ node }: { node: PositionedNode }) {
  const theme = useTheme();
  const color = paletteColor(theme, statusColorName(node.status));
  // Only the task name is shown; the workflow qualifier is dropped because every node in a graph
  // belongs to the same workflow (shown in the drawer header), so it's redundant and made ACTIVITY
  // nodes read as the full `workflow-…` path while HUMAN_TASK nodes stayed short. The raw label
  // remains available in the tooltip.
  const { task } = splitQualifiedName(node.label);
  const Icon = iconForType(node.type);
  const subtitle = typeLabel(node.type);
  const tooltip = `${node.label}${node.status ? ` — ${humanizeKey(node.status.toLowerCase())}` : ''}`;

  return (
    <Tooltip title={tooltip} placement="top" arrow>
      <Box
        sx={{
          position: 'absolute',
          left: node.x,
          top: node.y,
          width: NODE_W,
          height: NODE_H,
          boxSizing: 'border-box',
          px: 1.25,
          py: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          borderRadius: 1.5,
          border: '1px solid',
          borderColor: 'divider',
          borderLeft: `4px solid ${color}`,
          bgcolor: 'background.paper',
          boxShadow: 1,
          transition: 'box-shadow 0.15s',
          '&:hover': { boxShadow: 4 },
        }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 1, flexShrink: 0, color, bgcolor: alpha(color, 0.12) }}>
          <Icon size={18} />
        </Box>
        <Stack sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {task ?? node.label}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {subtitle}
          </Typography>
        </Stack>
        {node.status && <Box sx={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, bgcolor: color }} aria-label={node.status} />}
      </Box>
    </Tooltip>
  );
}

/** Renders a workflow execution's dependency graph as a left→right node-link DAG. */
export default function ExecutionGraph({ graph }: { graph: ExecutionGraph }) {
  const theme = useTheme();
  if (!graph.nodes || graph.nodes.length === 0) {
    return <Typography sx={{ py: 4, textAlign: 'center', color: 'text.secondary' }}>No execution graph available.</Typography>;
  }

  const layout = layoutDag(graph);
  const nodeById = new Map(layout.nodes.map((n) => [n.id, n]));
  const edgeColor = theme.palette.text.disabled;
  const markerId = 'wf-graph-arrow';

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'auto', maxHeight: '60vh', bgcolor: 'action.hover' }}>
      <Box sx={{ position: 'relative', width: layout.width, height: layout.height }}>
        <svg width={layout.width} height={layout.height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden>
          <defs>
            <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={edgeColor} />
            </marker>
          </defs>
          {layout.edges.map((e, i) => {
            const s = nodeById.get(e.source);
            const t = nodeById.get(e.target);
            if (!s || !t) return null;
            return <path key={i} d={edgePath(s, t)} fill="none" stroke={edgeColor} strokeWidth={1.5} markerEnd={`url(#${markerId})`} />;
          })}
        </svg>
        {layout.nodes.map((n) => (
          <GraphNodeCard key={n.id} node={n} />
        ))}
      </Box>
    </Box>
  );
}
