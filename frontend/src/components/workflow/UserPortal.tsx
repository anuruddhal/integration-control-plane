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

import { Alert, Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, ListingTable, Snackbar, Stack, TextField, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Eye, RefreshCw } from '@wso2/oxygen-ui-icons-react';
import { useState, type ReactNode } from 'react';
import SchemaFormFields from './SchemaFormFields';
import { buildFormResult, formatTime, humanizeKey, parseFormSchema, sectionTitleSx, sortByStartTimeDesc, unescapeRoleName } from './helpers';
import { StatusChip, type WorkflowScope } from './shared';
import Authorized from '../Authorized';
import { Permissions } from '../../constants/permissions';
import { useCompleteHumanTask, useFailHumanTask, useHumanTask, useHumanTasks, usePendingTaskCount, type HumanTask } from '../../api/workflows';

const emptySx = { py: 4, textAlign: 'center', color: 'text.secondary' } as const;

/**
 * Maps a runtime human-task status to its display status: a pending task's child workflow
 * reports RUNNING (shown as PENDING). Failed tasks report FAILED directly.
 */
const taskDisplayStatus = (s?: string) => (s === 'RUNNING' ? 'PENDING' : s);

/**
 * Display name for a human task: the title when set, else the task name with its
 * `<workflowType>.` qualifier stripped (runtime reports names as e.g. `placeOrderWorkflow.approveOrder`).
 */
function taskDisplayName(t?: HumanTask): string {
  if (!t) return '';
  if (t.title) return t.title;
  if (t.taskName) {
    const prefix = t.parentWorkflowType ? `${t.parentWorkflowType}.` : '';
    return prefix && t.taskName.startsWith(prefix) ? t.taskName.slice(prefix.length) : t.taskName;
  }
  return t.taskId;
}

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
          <ListingTable.Cell>Workflow Name</ListingTable.Cell>
          <ListingTable.Cell>Workflow ID</ListingTable.Cell>
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
                <Typography variant="body2">{taskDisplayName(t)}</Typography>
                {showActionable && t.canComplete === false && (
                  <Tooltip title="You do not have a matching role to complete this task">
                    <Chip label="Read-only" size="small" variant="outlined" sx={{ fontSize: 10, height: 18 }} />
                  </Tooltip>
                )}
              </Stack>
            </ListingTable.Cell>
            <ListingTable.Cell>
              <Typography variant="body2">{t.parentWorkflowType ?? '—'}</Typography>
            </ListingTable.Cell>
            <ListingTable.Cell>
              <Typography sx={{ fontFamily: 'monospace', fontSize: 12 }}>{t.parentWorkflowId ?? '—'}</Typography>
            </ListingTable.Cell>
            <ListingTable.Cell>
              <StatusChip status={taskDisplayStatus(t.status)} />
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
  const [openId, setOpenId] = useState<string | null>(null);
  const { data: page, isLoading, error, refetch, isFetching } = useHumanTasks(scope, { status: 'PENDING', limit: 50 });
  const tasks = sortByStartTimeDesc(page?.items ?? []);

  return (
    <>
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 2 }}>
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
  const [tab, setTab] = useState<'Completed' | 'Failed'>('Completed');
  const [openId, setOpenId] = useState<string | null>(null);
  // The list API reports a failed human task with status FAILED, so each tab maps directly
  // to a status query. Externally-terminated tasks (TERMINATED) are grouped under Failed too.
  const completedQuery = useHumanTasks(scope, { status: 'COMPLETED', limit: 50 });
  const failedQuery = useHumanTasks(scope, { status: 'FAILED', limit: 50 });
  const terminatedQuery = useHumanTasks(scope, { status: 'TERMINATED', limit: 50 });

  const isLoading = completedQuery.isLoading || failedQuery.isLoading || terminatedQuery.isLoading;
  const error = completedQuery.error ?? failedQuery.error ?? terminatedQuery.error;

  const items = tab === 'Completed' ? (completedQuery.data?.items ?? []) : [...(failedQuery.data?.items ?? []), ...(terminatedQuery.data?.items ?? [])];
  const tasks = sortByStartTimeDesc(items);

  return (
    <>
      <Stack direction="row" gap={1} sx={{ mb: 2 }} flexWrap="wrap">
        {(['Completed', 'Failed'] as const).map((t) => (
          <Chip key={t} label={t} size="small" color={tab === t ? 'primary' : 'default'} variant={tab === t ? 'filled' : 'outlined'} onClick={() => setTab(t)} />
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

/** Extracts key/value pairs from the task's `payload` JSON object; null when absent or empty. */
function payloadDetailEntries(payload: unknown): Array<[string, string]> | null {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const entries = Object.entries(payload as Record<string, unknown>);
  if (entries.length === 0) return null;
  return entries.map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]);
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack direction="row" gap={2}>
      <Typography variant="body2" sx={{ width: 140, flexShrink: 0, fontWeight: 600, color: 'text.disabled' }}>
        {label}
      </Typography>
      {typeof children === 'string' ? (
        <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
          {children}
        </Typography>
      ) : (
        children
      )}
    </Stack>
  );
}

function TaskDetailDialog({ scope, taskId, actionable, onClose, onToast }: { scope: WorkflowScope; taskId: string; actionable?: boolean; onClose: () => void; onToast: (t: Toast) => void }) {
  const { data: task, isLoading, error: taskError } = useHumanTask(scope, taskId);
  const complete = useCompleteHumanTask(scope);
  const fail = useFailHumanTask(scope);
  const [mode, setMode] = useState<'view' | 'complete' | 'fail'>('view');
  const [resultText, setResultText] = useState('{}');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [formValues, setFormValues] = useState<Record<string, string | boolean>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const busy = complete.isPending || fail.isPending;
  const canComplete = task?.canComplete !== false;
  const eligibleRoles = task?.eligibleRoles ?? (Array.isArray(task?.roles) ? (task.roles as string[]) : undefined) ?? task?.userRoles;
  const payloadDetails = payloadDetailEntries(task?.payload);
  const formFields = parseFormSchema(task?.formSchema);

  const setFormValue = (name: string, value: string | boolean) => {
    setFormValues((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => {
      if (!(name in prev)) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const mutateComplete = (result: unknown) => {
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

  const submitComplete = () => {
    // With a form schema, build the result from the generated form; otherwise fall back to raw JSON.
    if (formFields) {
      const { result, errors } = buildFormResult(formFields, formValues);
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }
      mutateComplete(result);
      return;
    }

    let result: unknown;
    try {
      result = resultText.trim() ? JSON.parse(resultText) : {};
    } catch {
      setErr('Result must be valid JSON.');
      return;
    }
    mutateComplete(result);
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
          onToast({ severity: 'success', message: 'Task marked as failed.' });
          onClose();
        },
        onError: (e) => onToast({ severity: 'error', message: e instanceof Error ? e.message : 'Failed to fail the task.' }),
      },
    );
  };

  // Returns to the initial view, keeping entered values but clearing validation errors.
  const backToView = () => {
    setMode('view');
    setErr('');
    setFieldErrors({});
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={sectionTitleSx}>
        <Stack direction="row" alignItems="center" gap={1.5}>
          <span>{task ? taskDisplayName(task) : taskId}</span>
          {task?.status && <StatusChip status={taskDisplayStatus(task.status)} />}
        </Stack>
      </DialogTitle>
      <DialogContent>
        {isLoading ? (
          <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', py: 4 }} />
        ) : taskError || !task ? (
          <Typography sx={emptySx}>{taskError instanceof Error ? taskError.message : 'Failed to load task details.'}</Typography>
        ) : (
          <Stack gap={2} sx={{ mt: 1 }}>
            {task?.description && (
              <Card variant="outlined" sx={{ bgcolor: 'action.hover' }}>
                <Typography variant="subtitle2" sx={{ px: 2, py: 1.5, ...sectionTitleSx }}>
                  Description
                </Typography>
                <Divider />
                <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 2 }}>
                  {task.description}
                </Typography>
              </Card>
            )}

            <Card variant="outlined" sx={{ bgcolor: 'action.hover' }}>
              <Typography variant="subtitle2" sx={{ px: 2, py: 1.5, ...sectionTitleSx }}>
                Task Detail
              </Typography>
              <Divider />
              <Stack gap={1.25} sx={{ px: 2, py: 2 }}>
                <DetailRow label="Created">{formatTime(task?.startTime)}</DetailRow>
                <DetailRow label="Eligible Roles">
                  {eligibleRoles?.length ? (
                    <Stack direction="row" gap={0.5} flexWrap="wrap">
                      {eligibleRoles.map((role) => (
                        <Chip key={role} label={unescapeRoleName(role)} size="small" variant="outlined" />
                      ))}
                    </Stack>
                  ) : (
                    '—'
                  )}
                </DetailRow>
                {payloadDetails?.map(([key, value]) => (
                  <DetailRow key={key} label={humanizeKey(key)}>
                    {value}
                  </DetailRow>
                ))}
              </Stack>
            </Card>

            {mode === 'complete' &&
              (formFields ? (
                <SchemaFormFields fields={formFields} values={formValues} errors={fieldErrors} onChange={setFormValue} />
              ) : (
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
              ))}
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
          {actionable && !!task && mode === 'view' && (
            <>
              <Button color="warning" disabled={busy} onClick={() => setMode('fail')}>
                Fail
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
          {mode !== 'view' && (
            <Button disabled={busy} onClick={backToView}>
              Back
            </Button>
          )}
          {mode === 'complete' && (
            <Button variant="contained" disabled={busy} onClick={submitComplete}>
              {complete.isPending ? 'Completing…' : 'Submit Completion'}
            </Button>
          )}
          {mode === 'fail' && (
            <Button variant="contained" color="warning" disabled={busy} onClick={submitFail}>
              {fail.isPending ? 'Submitting…' : 'Fail Task'}
            </Button>
          )}
        </Authorized>
      </DialogActions>
    </Dialog>
  );
}
