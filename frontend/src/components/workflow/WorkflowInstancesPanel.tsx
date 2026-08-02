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

import { Box, CircularProgress, ListingTable, Stack, Typography } from '@wso2/oxygen-ui';
import { useState, type JSX } from 'react';
import { useWorkflowInstances } from '../../api/workflows';
import SearchField from '../SearchField';
import { formatTime } from './helpers';
import { StatusChip, WorkflowIdLink } from './shared';

const emptySx = { py: 3, textAlign: 'center', color: 'text.secondary' } as const;

/**
 * The runs currently in flight for one workflow, shown on the integration overview where a workflow
 * entry point is selected. Deliberately narrow: search by workflow id is the only filter, since the
 * full set of filters lives on the Workflows page, which a workflow id links through to.
 *
 * Scoped to the integration by `taskQueue` — a project shares one Temporal namespace, so without it
 * the list would also carry runs belonging to the project's other integrations.
 */
export default function WorkflowInstancesPanel({ componentId, environmentId, workflowType, taskQueue }: { componentId: string; environmentId: string; workflowType: string; taskQueue?: string }): JSX.Element {
  const [search, setSearch] = useState('');
  const {
    data: page,
    isLoading,
    error,
  } = useWorkflowInstances(
    { componentId, environmentId },
    {
      status: 'RUNNING',
      workflowType,
      taskQueue,
      workflowId: search || undefined,
      limit: 50,
    },
  );
  const items = page?.items ?? [];

  return (
    <Box sx={{ px: 2, py: 1.5 }}>
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 1.5 }} flexWrap="wrap">
        <Typography variant="overline" color="text.secondary" sx={{ fontSize: 10, fontWeight: 600 }}>
          RUNNING INSTANCES
        </Typography>
        <Box sx={{ flex: 1 }} />
        <SearchField value={search} onChange={setSearch} placeholder="Search by workflow ID" sx={{ width: 260 }} />
      </Stack>

      {isLoading ? (
        <CircularProgress size={20} sx={{ display: 'block', mx: 'auto', py: 3 }} />
      ) : error ? (
        <Typography sx={emptySx}>{error instanceof Error ? error.message : 'Failed to load workflow instances.'}</Typography>
      ) : items.length === 0 ? (
        <Typography sx={emptySx}>{search ? 'No running instances match that workflow ID.' : 'No running instances.'}</Typography>
      ) : (
        <>
          <ListingTable>
            <ListingTable.Head>
              <ListingTable.Row>
                <ListingTable.Cell>Workflow ID</ListingTable.Cell>
                <ListingTable.Cell>Status</ListingTable.Cell>
                <ListingTable.Cell>Started</ListingTable.Cell>
              </ListingTable.Row>
            </ListingTable.Head>
            <ListingTable.Body>
              {items.map((wf) => (
                <ListingTable.Row key={`${wf.workflowId}:${wf.runId ?? ''}`}>
                  <ListingTable.Cell>
                    <WorkflowIdLink workflowId={wf.workflowId} environmentId={environmentId} />
                  </ListingTable.Cell>
                  <ListingTable.Cell>
                    <StatusChip status={wf.status} />
                  </ListingTable.Cell>
                  <ListingTable.Cell>{formatTime(wf.startTime)}</ListingTable.Cell>
                </ListingTable.Row>
              ))}
            </ListingTable.Body>
          </ListingTable>
          {page?.hasMore && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>
              Showing the first {items.length}. Open Workflows to narrow further.
            </Typography>
          )}
        </>
      )}
    </Box>
  );
}
