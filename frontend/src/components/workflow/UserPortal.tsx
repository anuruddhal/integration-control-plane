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

import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  ListingTable,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@wso2/oxygen-ui';
import { Eye, RefreshCw } from '@wso2/oxygen-ui-icons-react';
import { useState } from 'react';
import CodeViewer from '../CodeViewer';
import { formatTime, jsonPretty } from './helpers';
import { StatusChip, type WorkflowScope } from './shared';
import Authorized from '../Authorized';
import { Permissions } from '../../constants/permissions';
import {
  useCancelHumanTask,
  useCompleteHumanTask,
  useFailHumanTask,
  useHumanTask,
  useHumanTasks,
  usePendingTaskCount,
  type HumanTask,
} from '../../api/workflows';

const HISTORY_STATUSES = ['COMPLETED', 'FAILED', 'CANCELED'];
const emptySx = { py: 4, textAlign: 'center', color: 'text.secondary' } as const;

type Toast = { severity: 'success' | 'error'; message: string } | null;

export default function UserPortal({ componentId, environmentId }: WorkflowScope) {
  const scope: WorkflowScope = { componentId, environmentId };
  const [view, setView] = useState<'tasks' | 'history'>('tasks');
  const [toast, setToast] = useState<Toast>(null);
  const { data: pendingCount } = usePendingTaskCount(scope);

  return (
    <>
      <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 2 }}>
        <Button variant={view === 'tasks' ? 'contained' : 'outlined'} size="small" onClick={() => setView('tasks')}>
          My Tasks
        </Button>
        <Button variant={view === 'history' ? 'contained' : 'outlined'} size="small" onClick={() => setView('history')}>
          History
        </Button>
        <Box sx={{ flex: 1 }} />
        {pendingCount !== undefined && <Chip label={`${pendingCount} pending`} size="small" color={pendingCount > 0 ? 'info' : 'default'} />}
      </Stack>

      {view === 'tasks' ? <MyTasks scope={scope} onToast={setToast} /> : <TaskHistory scope={scope} onToast={setToast} />}

      <Snackbar open={toast !== null} autoHideDuration={4000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)} sx={{ width: '100%' }}>
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </>
  );
}

function TaskTable({ tasks, onOpen, showActionable }: { tasks: HumanTask[]; onOpen: (id: string) => void; showActionable?: boolean }) {
  return (
    <ListingTable>
      <ListingTable.Head>
        <ListingTable.Row>
          <ListingTable.Cell>Task</ListingTable.Cell>
          <ListingTable.Cell>Parent Workflow</ListingTable.Cell>
          <ListingTable.Cell>Status</ListingTable.Cell>
          <ListingTable.Cell>Started</ListingTable.Cell>
          <ListingTable.Cell>{showActionable ? 'Open' : 'View'}</ListingTable.Cell>
        </ListingTable.Row>
      </ListingTable.Head>
      <ListingTable.Body>
        {tasks.map((t) => (
          <ListingTable.Row key={t.taskId}>
            <ListingTable.Cell>
              <Stack direction="row" alignItems="center" gap={1}>
                <Typography variant="body2">{t.taskName ?? t.taskId}</Typography>
                {showActionable && t.canComplete === false && (
                  <Tooltip title="You do not have a matching role to complete this task">
                    <Chip label="Read-only" size="small" variant="outlined" sx={{ fontSize: 10, height: 18 }} />
                  </Tooltip>
                )}
              </Stack>
            </ListingTable.Cell>
            <ListingTable.Cell>
              <Typography sx={{ fontFamily: 'monospace', fontSize: 12 }}>{t.parentWorkflowId ?? '—'}</Typography>
            </ListingTable.Cell>
            <ListingTable.Cell>
              <StatusChip status={t.status} />
            </ListingTable.Cell>
            <ListingTable.Cell>{formatTime(t.startTime)}</ListingTable.Cell>
            <ListingTable.Cell>
              <Tooltip title="Open task">
                <IconButton size="small" onClick={() => onOpen(t.taskId)} aria-label="Open task">
                  <Eye size={16} />
                </IconButton>
              </Tooltip>
            </ListingTable.Cell>
          </ListingTable.Row>
        ))}
      </ListingTable.Body>
    </ListingTable>
  );
}

function MyTasks({ scope, onToast }: { scope: WorkflowScope; onToast: (t: Toast) => void }) {
  const [onlyMine, setOnlyMine] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data: page, isLoading, error, refetch, isFetching } = useHumanTasks(scope, { status: 'PENDING', onlyMyTasks: onlyMine, limit: 50 });
  const tasks = page?.items ?? [];

  return (
    <>
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 2 }}>
        <FormControlLabel control={<Checkbox size="small" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />} label="Only my tasks" />
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={() => refetch()} aria-label="Refresh">
            <RefreshCw size={16} style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} />
          </IconButton>
        </Tooltip>
      </Stack>

      {isLoading ? (
        <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', py: 4 }} />
      ) : error ? (
        <Typography sx={emptySx}>{error instanceof Error ? error.message : 'Failed to load tasks.'}</Typography>
      ) : tasks.length === 0 ? (
        <Typography sx={emptySx}>No pending tasks.</Typography>
      ) : (
        <TaskTable tasks={tasks} onOpen={setOpenId} showActionable />
      )}

      {openId && <TaskDetailDialog scope={scope} taskId={openId} actionable onClose={() => setOpenId(null)} onToast={onToast} />}
    </>
  );
}

function TaskHistory({ scope, onToast }: { scope: WorkflowScope; onToast: (t: Toast) => void }) {
  const [status, setStatus] = useState('COMPLETED');
  const [openId, setOpenId] = useState<string | null>(null);
  const { data: page, isLoading, error } = useHumanTasks(scope, { status, limit: 50 });
  const tasks = page?.items ?? [];

  return (
    <>
      <Stack direction="row" gap={1} sx={{ mb: 2 }} flexWrap="wrap">
        {HISTORY_STATUSES.map((s) => (
          <Chip key={s} label={s.charAt(0) + s.slice(1).toLowerCase()} size="small" color={status === s ? 'primary' : 'default'} variant={status === s ? 'filled' : 'outlined'} onClick={() => setStatus(s)} />
        ))}
      </Stack>

      {isLoading ? (
        <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', py: 4 }} />
      ) : error ? (
        <Typography sx={emptySx}>{error instanceof Error ? error.message : 'Failed to load history.'}</Typography>
      ) : tasks.length === 0 ? (
        <Typography sx={emptySx}>No tasks in this category.</Typography>
      ) : (
        <TaskTable tasks={tasks} onOpen={setOpenId} />
      )}

      {openId && <TaskDetailDialog scope={scope} taskId={openId} onClose={() => setOpenId(null)} onToast={onToast} />}
    </>
  );
}

function TaskDetailDialog({ scope, taskId, actionable, onClose, onToast }: { scope: WorkflowScope; taskId: string; actionable?: boolean; onClose: () => void; onToast: (t: Toast) => void }) {
  const { data: task, isLoading } = useHumanTask(scope, taskId);
  const complete = useCompleteHumanTask(scope);
  const fail = useFailHumanTask(scope);
  const cancel = useCancelHumanTask(scope);
  const [mode, setMode] = useState<'view' | 'complete' | 'fail'>('view');
  const [resultText, setResultText] = useState('{}');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');

  const busy = complete.isPending || fail.isPending || cancel.isPending;
  const canComplete = task?.canComplete !== false;

  const submitComplete = () => {
    let result: unknown;
    try {
      result = resultText.trim() ? JSON.parse(resultText) : {};
    } catch {
      setErr('Result must be valid JSON.');
      return;
    }
    complete.mutate(
      { taskId, result },
      {
        onSuccess: () => {
          onToast({ severity: 'success', message: 'Task completed.' });
          onClose();
        },
        onError: (e) => onToast({ severity: 'error', message: e instanceof Error ? e.message : 'Failed to complete task.' }),
      },
    );
  };

  const submitFail = () => {
    if (!reason.trim()) {
      setErr('Reason is required.');
      return;
    }
    fail.mutate(
      { taskId, reason: reason.trim() },
      {
        onSuccess: () => {
          onToast({ severity: 'success', message: 'Task failed/rejected.' });
          onClose();
        },
        onError: (e) => onToast({ severity: 'error', message: e instanceof Error ? e.message : 'Failed to reject task.' }),
      },
    );
  };

  const submitCancel = () => {
    cancel.mutate(
      { taskId },
      {
        onSuccess: () => {
          onToast({ severity: 'success', message: 'Task cancelled.' });
          onClose();
        },
        onError: (e) => onToast({ severity: 'error', message: e instanceof Error ? e.message : 'Failed to cancel task.' }),
      },
    );
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" gap={1.5}>
          <span>{task?.taskName ?? taskId}</span>
          {task?.status && <StatusChip status={task.status} />}
        </Stack>
      </DialogTitle>
      <DialogContent>
        {isLoading ? (
          <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', py: 4 }} />
        ) : (
          <Stack gap={2} sx={{ mt: 1 }}>
            <CodeViewer code={jsonPretty(task)} language="json" title="Task details" maxHeight="40vh" showLineNumbers={false} />

            {mode === 'complete' && (
              <TextField
                label="Result (JSON)"
                fullWidth
                multiline
                minRows={4}
                value={resultText}
                onChange={(e) => {
                  setResultText(e.target.value);
                  setErr('');
                }}
                error={!!err}
                helperText={err || 'Payload submitted as the task result.'}
                slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 13 } } }}
              />
            )}
            {mode === 'fail' && (
              <TextField
                label="Reason"
                fullWidth
                required
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setErr('');
                }}
                error={!!err}
                helperText={err}
              />
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={onClose}>Close</Button>
        {/* Acting on human tasks requires the workflow manage-human-tasks permission. */}
        <Authorized permissions={[Permissions.WORKFLOW_MANAGE_HUMAN_TASKS]}>
          {actionable && mode === 'view' && (
            <>
              <Button color="error" disabled={busy} onClick={submitCancel}>
                Cancel Task
              </Button>
              <Button color="warning" disabled={busy} onClick={() => setMode('fail')}>
                Reject
              </Button>
              <Tooltip title={canComplete ? '' : 'You do not have a matching role to complete this task'}>
                <span>
                  <Button variant="contained" disabled={busy || !canComplete} onClick={() => setMode('complete')}>
                    Complete
                  </Button>
                </span>
              </Tooltip>
            </>
          )}
          {mode === 'complete' && (
            <Button variant="contained" disabled={busy} onClick={submitComplete}>
              {complete.isPending ? 'Completing…' : 'Submit Completion'}
            </Button>
          )}
          {mode === 'fail' && (
            <Button variant="contained" color="warning" disabled={busy} onClick={submitFail}>
              {fail.isPending ? 'Submitting…' : 'Submit Rejection'}
            </Button>
          )}
        </Authorized>
      </DialogActions>
    </Dialog>
  );
}
