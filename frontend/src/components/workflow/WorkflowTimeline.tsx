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
import { buildTimeline, formatDuration, splitQualifiedName, type TimelineSpan } from './helpers';
import { iconForType, paletteColor, statusColorName, typeLabel } from './graphVisuals';

const LABEL_W = 190; // px, fixed left column of span names
const ROW_H = 36; // px per span row
const BAR_H = 16; // px bar thickness
const AXIS_H = 26; // px for the time ruler
const TICK_COUNT = 5; // gridlines / axis labels (TICK_COUNT - 1 intervals)

const emptySx = { py: 4, textAlign: 'center', color: 'text.secondary' } as const;

function SpanBar({ span, total, rangeStart }: { span: TimelineSpan; total: number; rangeStart: number }) {
  const theme = useTheme();
  const color = paletteColor(theme, statusColorName(span.status));
  const leftPct = ((span.start - rangeStart) / total) * 100;
  const widthPct = Math.max(0.75, Math.min(((span.end - span.start) / total) * 100, 100 - leftPct));
  const duration = span.end - span.start;
  const tooltip = `${span.label} — ${typeLabel(span.status)} · ${formatDuration(duration)}`;

  return (
    <Box sx={{ position: 'relative', height: ROW_H }}>
      <Tooltip title={tooltip} placement="top" arrow>
        <Box
          sx={{
            position: 'absolute',
            top: (ROW_H - BAR_H) / 2,
            left: `${leftPct}%`,
            width: `${Math.max(widthPct, 0.75)}%`,
            minWidth: 3,
            height: BAR_H,
            borderRadius: 0.75,
            borderLeft: `2px solid ${color}`,
            bgcolor: alpha(color, span.running ? 0.28 : 0.85),
            backgroundImage: span.running ? `repeating-linear-gradient(45deg, ${alpha(color, 0.55)} 0 5px, transparent 5px 10px)` : undefined,
            boxSizing: 'border-box',
          }}
        />
      </Tooltip>
    </Box>
  );
}

/** Renders a workflow's history as a Gantt timeline: one duration bar per activity / human task / timer. */
export default function WorkflowTimeline({ events }: { events: ReadonlyArray<Record<string, unknown>> }) {
  const theme = useTheme();
  const { spans, start, end } = buildTimeline(events);

  if (spans.length === 0) {
    return <Typography sx={emptySx}>No timeline data available.</Typography>;
  }

  const total = Math.max(1, end - start);
  const ticks = Array.from({ length: TICK_COUNT }, (_, i) => {
    const pct = (i / (TICK_COUNT - 1)) * 100;
    return { pct, label: formatDuration((total * i) / (TICK_COUNT - 1)), anchor: i === 0 ? 'left' : i === TICK_COUNT - 1 ? 'right' : 'center' };
  });

  return (
    <Stack gap={1}>
      <Typography variant="caption" color="text.secondary">
        Started {new Date(start).toLocaleString()} · Total {formatDuration(total)}
      </Typography>
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflowX: 'auto', maxHeight: '60vh', overflowY: 'auto', bgcolor: 'action.hover' }}>
        <Box sx={{ display: 'flex', minWidth: LABEL_W + 360 }}>
          {/* Left column: span labels */}
          <Box sx={{ width: LABEL_W, flexShrink: 0, borderRight: '1px solid', borderColor: 'divider' }}>
            {spans.map((s) => {
              const { workflow, task } = splitQualifiedName(s.label);
              const Icon = iconForType(s.category);
              const color = paletteColor(theme, statusColorName(s.status));
              return (
                <Stack key={s.key} direction="row" alignItems="center" gap={0.75} sx={{ height: ROW_H, px: 1, minWidth: 0 }}>
                  <Box sx={{ color, display: 'flex', flexShrink: 0 }}>
                    <Icon size={14} />
                  </Box>
                  <Tooltip title={workflow ? `${workflow}.${task ?? s.label}` : (task ?? s.label)} placement="top">
                    <Typography variant="caption" sx={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {task ?? s.label}
                    </Typography>
                  </Tooltip>
                </Stack>
              );
            })}
            <Box sx={{ height: AXIS_H }} />
          </Box>

          {/* Right column: gridlines, bars, and the time axis */}
          <Box sx={{ flex: 1, position: 'relative', minWidth: 360 }}>
            <Box sx={{ position: 'relative', height: spans.length * ROW_H }}>
              {ticks.map((t) => (
                <Box key={t.pct} sx={{ position: 'absolute', left: `${t.pct}%`, top: 0, bottom: 0, width: '1px', bgcolor: 'divider', opacity: 0.6 }} />
              ))}
              {spans.map((s) => (
                <SpanBar key={s.key} span={s} total={total} rangeStart={start} />
              ))}
            </Box>
            <Box sx={{ position: 'relative', height: AXIS_H, borderTop: '1px solid', borderColor: 'divider' }}>
              {ticks.map((t) => (
                <Typography
                  key={t.pct}
                  variant="caption"
                  sx={{
                    position: 'absolute',
                    top: 4,
                    left: `${t.pct}%`,
                    transform: t.anchor === 'left' ? 'none' : t.anchor === 'right' ? 'translateX(-100%)' : 'translateX(-50%)',
                    color: 'text.secondary',
                    whiteSpace: 'nowrap',
                  }}>
                  {t.label}
                </Typography>
              ))}
            </Box>
          </Box>
        </Box>
      </Box>
    </Stack>
  );
}
