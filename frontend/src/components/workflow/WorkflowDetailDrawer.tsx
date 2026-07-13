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

import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Drawer, IconButton, ListingTable, Snackbar, Stack, Tab, Tabs, TextField, Typography } from '@wso2/oxygen-ui';
import { Ban, OctagonX, PauseCircle, PlayCircle, X } from '@wso2/oxygen-ui-icons-react';
import { useState } from 'react';
import CodeViewer from '../CodeViewer';
import { useWorkflowExecutionGraph, useWorkflowHistory, useWorkflowInfo, useWorkflowLifecycle, type WorkflowLifecycleAction } from '../../api/workflows';
import { extractWorkflowInput, jsonPretty } from './helpers';
import { StatusChip, type WorkflowScope } from './shared';
import Authorized from '../Authorized';
import { Permissions } from '../../constants/permissions';

const drawerSx = { '& .MuiDrawer-paper': { width: '60%', maxWidth: 760, minWidth: 420, position: 'fixed', top: 64, height: 'calc(100% - 64px)', borderLeft: '1px solid', borderColor: 'divider' } };
const headerSx = { px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' };
const emptySx = { py: 4, textAlign: 'center', color: 'text.secondary' };

export default function WorkflowDetailDrawer({ scope, workflowId, onClose }: { scope: WorkflowScope; workflowId: string; onClose: () => void }) {
  const [tab, setTab] = useState(0);
  const [terminateOpen, setTerminateOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [toast, setToast] = useState<{ severity: 'success' | 'error'; message: string } | null>(null);

  const { data: info, isLoading: loadingInfo, error: infoError } = useWorkflowInfo(scope, workflowId);
  // History is loaded eagerly: the Info tab derives the start input from it, and the History tab renders it.
  const { data: history = [], isLoading: loadingHistory } = useWorkflowHistory(scope, workflowId);
  const { data: graph, isLoading: loadingGraph } = useWorkflowExecutionGraph(scope, tab === 2 ? workflowId : null);
  const lifecycle = useWorkflowLifecycle(scope);

  const status = (info?.status as string | undefined) ?? '';
  const runId = (info?.runId as string | undefined) ?? '';
  const startInput = extractWorkflowInput(history as Array<Record<string, unknown>>);

  const runAction = (action: WorkflowLifecycleAction, actionReason?: string) => {
    lifecycle.mutate(
      { workflowId, action, reason: actionReason },
      {
        onSuccess: () => setToast({ severity: 'success', message: `Workflow ${action} requested.` }),
        onError: (e) => setToast({ severity: 'error', message: e instanceof Error ? e.message : `Failed to ${action}.` }),
      },
    );
  };

  const historyEventKeys = history.length > 0 ? Object.keys(history[0]).slice(0, 5) : [];

  return (
    <Drawer anchor="right" open variant="persistent" sx={drawerSx} onClose={onClose}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={headerSx}>
        <Stack direction="row" alignItems="center" gap={1.5} sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {workflowId}
          </Typography>
          {status && <StatusChip status={status} />}
        </Stack>
        <IconButton size="small" aria-label="close" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </Stack>

      {/* Lifecycle actions — only for users who can manage workflow executions */}
      <Authorized permissions={[Permissions.WORKFLOW_MANAGE_WORKFLOWS]}>
        <Stack direction="row" gap={1} sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', flexWrap: 'wrap' }}>
          <Button size="small" variant="outlined" startIcon={<PauseCircle size={14} />} disabled={lifecycle.isPending} onClick={() => runAction('suspend')}>
            Suspend
          </Button>
          <Button size="small" variant="outlined" startIcon={<PlayCircle size={14} />} disabled={lifecycle.isPending} onClick={() => runAction('resume')}>
            Resume
          </Button>
          <Button size="small" variant="outlined" color="warning" startIcon={<Ban size={14} />} disabled={lifecycle.isPending} onClick={() => runAction('cancel')}>
            Cancel
          </Button>
          <Button size="small" variant="outlined" color="error" startIcon={<OctagonX size={14} />} disabled={lifecycle.isPending} onClick={() => setTerminateOpen(true)}>
            Terminate
          </Button>
        </Stack>
      </Authorized>

      <Box sx={{ px: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
          <Tab label="Info" />
          <Tab label="History" />
          <Tab label="Execution Graph" />
        </Tabs>

        {tab === 0 &&
          (loadingInfo ? (
            <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', py: 4 }} />
          ) : infoError || !info ? (
            <Typography sx={emptySx}>Could not load workflow info.</Typography>
          ) : (
            <Stack gap={1.5}>
              {runId && (
                <Stack direction="row" gap={2}>
                  <Typography variant="caption" color="text.secondary" sx={{ minWidth: 120 }}>
                    Run ID
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {runId}
                  </Typography>
                </Stack>
              )}
              {startInput !== null && <CodeViewer code={startInput} language="json" title="Start input" maxHeight="30vh" showLineNumbers={false} />}
              <CodeViewer code={jsonPretty(info)} language="json" title="Execution info" maxHeight="45vh" showLineNumbers={false} />
            </Stack>
          ))}

        {tab === 1 &&
          (loadingHistory ? (
            <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', py: 4 }} />
          ) : history.length === 0 ? (
            <Typography sx={emptySx}>No history events.</Typography>
          ) : (
            <ListingTable>
              <ListingTable.Head>
                <ListingTable.Row>
                  {historyEventKeys.map((k) => (
                    <ListingTable.Cell key={k}>{k}</ListingTable.Cell>
                  ))}
                </ListingTable.Row>
              </ListingTable.Head>
              <ListingTable.Body>
                {history.map((ev, i) => (
                  <ListingTable.Row key={i}>
                    {historyEventKeys.map((k) => (
                      <ListingTable.Cell key={k}>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                          {typeof ev[k] === 'object' ? JSON.stringify(ev[k]) : String(ev[k] ?? '—')}
                        </Typography>
                      </ListingTable.Cell>
                    ))}
                  </ListingTable.Row>
                ))}
              </ListingTable.Body>
            </ListingTable>
          ))}

        {tab === 2 &&
          (loadingGraph ? (
            <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', py: 4 }} />
          ) : !graph ? (
            <Typography sx={emptySx}>No execution graph available.</Typography>
          ) : (
            <CodeViewer code={jsonPretty(graph)} language="json" title="Execution graph" maxHeight="60vh" showLineNumbers={false} />
          ))}
      </Box>

      <Dialog open={terminateOpen} onClose={() => setTerminateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Terminate Workflow</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Terminate <strong>{workflowId}</strong> immediately? This cannot be undone.
          </DialogContentText>
          <TextField label="Reason (optional)" fullWidth size="small" value={reason} onChange={(e) => setReason(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTerminateOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              runAction('terminate', reason);
              setTerminateOpen(false);
              setReason('');
            }}>
            Terminate
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={toast !== null} autoHideDuration={4000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)} sx={{ width: '100%' }}>
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Drawer>
  );
}
