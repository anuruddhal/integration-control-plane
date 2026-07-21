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

import { Box, Chip, Collapse, Stack, Typography } from '@wso2/oxygen-ui';
import { ChevronRight } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import CodeViewer from '../CodeViewer';

export interface WorkflowScope {
  componentId: string;
  environmentId: string;
}

type ChipColor = 'default' | 'primary' | 'success' | 'error' | 'warning' | 'info';

const STATUS_COLORS: Record<string, ChipColor> = {
  RUNNING: 'info',
  COMPLETED: 'success',
  FAILED: 'error',
  TERMINATED: 'error',
  CANCELED: 'warning',
  CANCELLED: 'warning',
  TIMED_OUT: 'warning',
  CONTINUED_AS_NEW: 'default',
  SUSPENDED: 'warning',
  PENDING: 'info',
  OPEN: 'info',
};

/** Renders a status string as a colour-coded chip. */
export function StatusChip({ status }: { status?: string }): JSX.Element {
  const normalized = (status ?? '').toUpperCase();
  const color = STATUS_COLORS[normalized] ?? 'default';
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase().replace(/_/g, ' ') : '—';
  return <Chip label={label} size="small" color={color} variant="outlined" />;
}

/** A compact, theme-consistent expandable panel for revealing a JSON schema/payload. */
export function SchemaDisclosure({ schema, label = 'Click to see Input Schema' }: { schema: string; label?: string }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
      <Stack
        direction="row"
        alignItems="center"
        gap={0.5}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        sx={{ px: 1.5, py: 1, cursor: 'pointer', userSelect: 'none', bgcolor: 'action.hover', '&:hover': { bgcolor: 'action.selected' }, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 } }}>
        <ChevronRight size={16} style={{ transition: 'transform 0.15s', transform: open ? 'rotate(90deg)' : 'none', flexShrink: 0 }} />
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {label}
        </Typography>
      </Stack>
      <Collapse in={open}>
        <Box sx={{ p: 1 }}>
          <CodeViewer code={schema} language="json" showCopyButton maxHeight="40vh" showLineNumbers={false} />
        </Box>
      </Collapse>
    </Box>
  );
}
