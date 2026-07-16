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

import { Alert, Autocomplete, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, ListingTable, MenuItem, Select, Snackbar, Stack, TextField, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Copy, Eye, Play, RefreshCw, RotateCcw, Plus } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { resourceUrl, useScope } from '../../nav';
import SearchField from '../SearchField';
import SchemaFormFields from './SchemaFormFields';
import WorkflowDetailDrawer from './WorkflowDetailDrawer';
import { buildFormResult, formatTime, parseFormSchema, sectionTitleSx, sortByStartTimeDesc, splitQualifiedName } from './helpers';
import { SchemaDisclosure, StatusChip, type WorkflowScope } from './shared';
import Authorized from '../Authorized';
import { Permissions } from '../../constants/permissions';
import { useRetryDecision, useRetryTasks, useStartWorkflow, useWorkflowDefinitions, useWorkflowInstances, type RetryDecision, type WorkflowDefinition } from '../../api/workflows';

const WORKFLOW_STATUSES = ['All', 'RUNNING', 'COMPLETED', 'FAILED', 'TERMINATED', 'CANCELED', 'TIMED_OUT'];
const RETRY_TASK_STATUSES = ['All', 'PENDING', 'COMPLETED', 'CANCELED', 'TERMINATED'];
const emptySx = { py: 4, textAlign: 'center', color: 'text.secondary' } as const;

const statusLabel = (s: string) => (s === 'All' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' '));

// Retry tasks report their child workflow's status, where a pending task is RUNNING.
// Display it as PENDING to match the status filter values.
const retryDisplayStatus = (s?: string) => (s === 'RUNNING' ? 'PENDING' : s);

/** Converts a `datetime-local` input value to an ISO-8601 string, or undefined when empty/invalid. */
const localToIso = (v: string): string | undefined => {
  if (!v) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
};

/** Formats a Date as a `datetime-local` input value (YYYY-MM-DDTHH:MM). */
const toLocalInput = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const ANY_TIME = 'Any time';
const CUSTOM_RANGE = 'Custom';
// Relative presets for the time-range dropdown (window length in milliseconds).
const TIME_PRESETS: { label: string; ms: number }[] = [
  { label: 'Past 10 minutes', ms: 10 * 60_000 },
  { label: 'Past 30 minutes', ms: 30 * 60_000 },
  { label: 'Past 1 hour', ms: 60 * 60_000 },
  { label: 'Past 24 hours', ms: 24 * 60 * 60_000 },
];

export type Toast = { severity: 'success' | 'error'; message: string } | null;

// ── Shared filter controls (used by the Workflows and Retry Tasks views) ─────

function StatusFilter({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return <Autocomplete size="small" sx={{ width: 180 }} options={options} value={value} disableClearable getOptionLabel={statusLabel} onChange={(_, v) => onChange(v ?? 'All')} renderInput={(params) => <TextField {...params} label="Status" />} />;
}

function WorkflowNameFilter({ definitions, value, onChange }: { definitions: WorkflowDefinition[]; value: WorkflowDefinition | null; onChange: (v: WorkflowDefinition | null) => void }) {
  return (
    <Autocomplete
      size="small"
      sx={{ width: 240 }}
      options={definitions}
      value={value}
      getOptionLabel={(d) => d.workflowType}
      isOptionEqualToValue={(a, b) => a.workflowType === b.workflowType}
      onChange={(_, v) => onChange(v)}
      renderInput={(params) => <TextField {...params} label="Workflow name" placeholder="All workflows" />}
    />
  );
}

/** Owns the time-range dropdown (relative presets + custom bounds) and resolves it to ISO bounds. */
function useTimeRangeFilter() {
  const [timeRange, setTimeRange] = useState(ANY_TIME);
  const [customStart, setCustomStart] = useState(() => toLocalInput(new Date(Date.now() - 24 * 3600_000)));
  const [customEnd, setCustomEnd] = useState(() => toLocalInput(new Date()));

  // Memoized so a relative preset snapshots "now" only when the selection changes —
  // recomputing every render would change the query key continuously and refetch in a loop.
  const bounds = useMemo<{ startTimeFrom?: string; startTimeTo?: string }>(() => {
    if (timeRange === ANY_TIME) return {};
    if (timeRange === CUSTOM_RANGE) return { startTimeFrom: localToIso(customStart), startTimeTo: localToIso(customEnd) };
    const preset = TIME_PRESETS.find((p) => p.label === timeRange);
    if (!preset) return {};
    const now = Date.now();
    return { startTimeFrom: new Date(now - preset.ms).toISOString(), startTimeTo: new Date(now).toISOString() };
  }, [timeRange, customStart, customEnd]);

  const controls = (
    <>
      <Select
        size="small"
        sx={{ minWidth: 170 }}
        value={timeRange}
        onChange={(e) => {
          const v = e.target.value as string;
          setTimeRange(v);
          if (v === CUSTOM_RANGE) {
            setCustomStart(toLocalInput(new Date(Date.now() - 24 * 3600_000)));
            setCustomEnd(toLocalInput(new Date()));
          }
        }}
        inputProps={{ 'aria-label': 'Time range' }}>
        <MenuItem value={ANY_TIME}>{ANY_TIME}</MenuItem>
        {TIME_PRESETS.map((p) => (
          <MenuItem key={p.label} value={p.label}>
            {p.label}
          </MenuItem>
        ))}
        <MenuItem value={CUSTOM_RANGE}>{CUSTOM_RANGE}</MenuItem>
      </Select>
      {timeRange === CUSTOM_RANGE && (
        <>
          <TextField label="Start from" type="datetime-local" size="small" value={customStart} onChange={(e) => setCustomStart(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField label="End on" type="datetime-local" size="small" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        </>
      )}
    </>
  );

  return { bounds, controls, active: timeRange !== ANY_TIME, reset: () => setTimeRange(ANY_TIME) };
}

export default function AdminPortal({ componentId, environmentId, initialWorkflowType, initialWorkflowId }: WorkflowScope & { initialWorkflowType?: string; initialWorkflowId?: string }) {
  const scope: WorkflowScope = { componentId, environmentId };
  const [view, setView] = useState<'workflows' | 'retry'>('workflows');
  const [toast, setToast] = useState<Toast>(null);

  return (
    <>
      <Stack direction="row" gap={1} sx={{ mb: 2 }}>
        <Button variant={view === 'workflows' ? 'contained' : 'outlined'} size="small" onClick={() => setView('workflows')}>
          Workflows
        </Button>
        <Button variant={view === 'retry' ? 'contained' : 'outlined'} size="small" onClick={() => setView('retry')}>
          Retry Tasks
        </Button>
      </Stack>

      {view === 'workflows' ? <WorkflowsAdmin scope={scope} onToast={setToast} initialWorkflowType={initialWorkflowType} initialWorkflowId={initialWorkflowId} /> : <RetryTasksAdmin scope={scope} onToast={setToast} />}

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

// ── Workflows ────────────────────────────────────────────────────────────────

function WorkflowsAdmin({ scope, onToast, initialWorkflowType, initialWorkflowId }: { scope: WorkflowScope; onToast: (t: Toast) => void; initialWorkflowType?: string; initialWorkflowId?: string }) {
  const [status, setStatus] = useState('All');
  // Seed the type filter from a deep link (e.g. Overview → "View Instances"). The Autocomplete
  // matches options by workflowType, so a minimal {workflowType} object selects the right option.
  const [selectedType, setSelectedType] = useState<WorkflowDefinition | null>(initialWorkflowType ? { workflowType: initialWorkflowType } : null);
  // Seed the ID search from a deep link (e.g. the start-workflow success dialog's "View Instance").
  const [search, setSearch] = useState(initialWorkflowId ?? '');
  const timeFilter = useTimeRangeFilter();
  const [startOpen, setStartOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: definitions = [] } = useWorkflowDefinitions(scope);

  const filters = {
    status: status === 'All' ? undefined : status,
    workflowType: selectedType?.workflowType || undefined,
    workflowId: search || undefined,
    startTimeFrom: timeFilter.bounds.startTimeFrom,
    startTimeTo: timeFilter.bounds.startTimeTo,
    limit: 50,
  };
  const { data: page, isLoading, error, refetch, isFetching } = useWorkflowInstances(scope, filters);
  const items = sortByStartTimeDesc(page?.items ?? []);
  const hasFilters = status !== 'All' || !!selectedType || !!search || timeFilter.active;

  return (
    <>
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 2 }} flexWrap="wrap">
        <SearchField value={search} onChange={setSearch} placeholder="Search by workflow ID" sx={{ width: 280 }} />
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={() => refetch()} aria-label="Refresh">
            <RefreshCw size={16} style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} />
          </IconButton>
        </Tooltip>
        <Authorized permissions={[Permissions.WORKFLOW_MANAGE_WORKFLOWS]}>
          <Button variant="contained" size="small" startIcon={<Play size={14} />} onClick={() => setStartOpen(true)}>
            Start Workflow
          </Button>
        </Authorized>
      </Stack>

      <Stack direction="row" gap={1.5} sx={{ mb: 2 }} flexWrap="wrap" alignItems="center">
        <StatusFilter options={WORKFLOW_STATUSES} value={status} onChange={setStatus} />
        <WorkflowNameFilter definitions={definitions} value={selectedType} onChange={setSelectedType} />
        {timeFilter.controls}
        {hasFilters && (
          <Button
            size="small"
            onClick={() => {
              setStatus('All');
              setSelectedType(null);
              setSearch('');
              timeFilter.reset();
            }}>
            Clear
          </Button>
        )}
      </Stack>

      {isLoading ? (
        <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', py: 4 }} />
      ) : error ? (
        <Typography sx={emptySx}>{error instanceof Error ? error.message : 'Failed to load workflows.'}</Typography>
      ) : items.length === 0 ? (
        <Typography sx={emptySx}>No workflows found.</Typography>
      ) : (
        <>
          <ListingTable>
            <ListingTable.Head>
              <ListingTable.Row>
                <ListingTable.Cell>Workflow ID</ListingTable.Cell>
                <ListingTable.Cell>Name</ListingTable.Cell>
                <ListingTable.Cell>Status</ListingTable.Cell>
                <ListingTable.Cell>Started</ListingTable.Cell>
                <ListingTable.Cell>Actions</ListingTable.Cell>
              </ListingTable.Row>
            </ListingTable.Head>
            <ListingTable.Body>
              {items.map((wf) => (
                <ListingTable.Row key={`${wf.workflowId}:${wf.runId ?? ''}`}>
                  <ListingTable.Cell>
                    <Typography sx={{ fontFamily: 'monospace', fontSize: 12 }}>{wf.workflowId}</Typography>
                  </ListingTable.Cell>
                  <ListingTable.Cell>{wf.workflowType ?? '—'}</ListingTable.Cell>
                  <ListingTable.Cell>
                    <StatusChip status={wf.status} />
                  </ListingTable.Cell>
                  <ListingTable.Cell>{formatTime(wf.startTime)}</ListingTable.Cell>
                  <ListingTable.Cell>
                    <Tooltip title="View details">
                      <IconButton size="small" onClick={() => setDetailId(wf.workflowId)} aria-label="View details">
                        <Eye size={16} />
                      </IconButton>
                    </Tooltip>
                  </ListingTable.Cell>
                </ListingTable.Row>
              ))}
            </ListingTable.Body>
          </ListingTable>
          {page?.hasMore && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>
              Showing the first {items.length}. Refine filters to narrow results.
            </Typography>
          )}
        </>
      )}

      {startOpen && <StartWorkflowDialog scope={scope} onClose={() => setStartOpen(false)} onToast={onToast} />}
      {detailId && <WorkflowDetailDrawer scope={scope} workflowId={detailId} onClose={() => setDetailId(null)} />}
    </>
  );
}

export function StartWorkflowDialog({ scope, initialWorkflowType, onClose, onToast }: { scope: WorkflowScope; initialWorkflowType?: string; onClose: () => void; onToast: (t: Toast) => void }) {
  const { data: definitions = [] } = useWorkflowDefinitions(scope);
  const start = useStartWorkflow(scope);
  // Seeded from a deep link (e.g. Overview → "Start Workflow") with a minimal {workflowType}
  // object; the full definition (with inputSchema) is resolved once definitions load.
  const [selected, setSelected] = useState<WorkflowDefinition | null>(initialWorkflowType ? { workflowType: initialWorkflowType } : null);
  const [workflowId, setWorkflowId] = useState('');
  const [timeout, setTimeoutVal] = useState('');
  const [formValues, setFormValues] = useState<Record<string, string | boolean>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [started, setStarted] = useState<{ workflowType: string; workflowId: string } | null>(null);
  const navigate = useNavigate();
  const navScope = useScope();

  const type = selected ? (definitions.find((d) => d.workflowType === selected.workflowType) ?? selected) : null;

  // When the input schema parses into fields, a generated form replaces the raw JSON input.
  const formFields = type ? parseFormSchema(type.inputSchema) : null;

  const setFormValue = (name: string, value: string | boolean) => {
    setFormValues((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => {
      if (!(name in prev)) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const submit = () => {
    if (!type) return;
    let parsedInput: unknown;
    if (formFields) {
      const { result, errors } = buildFormResult(formFields, formValues);
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }
      parsedInput = Object.keys(result).length > 0 ? result : undefined;
    }
    start.mutate(
      {
        workflowType: type.workflowType,
        input: parsedInput,
        workflowId: workflowId.trim() || undefined,
        timeoutSeconds: timeout.trim() ? Number(timeout) : undefined,
      },
      {
        onSuccess: (wf) => {
          if (wf?.workflowId) {
            setStarted({ workflowType: type.workflowType, workflowId: wf.workflowId });
          } else {
            onToast({ severity: 'success', message: `Started ${type.workflowType}.` });
            onClose();
          }
        },
        onError: (e) => onToast({ severity: 'error', message: e instanceof Error ? e.message : 'Failed to start workflow.' }),
      },
    );
  };

  const copyWorkflowId = async () => {
    if (!started) return;
    try {
      await navigator.clipboard.writeText(started.workflowId);
      onToast({ severity: 'success', message: 'Workflow ID copied to clipboard.' });
    } catch {
      onToast({ severity: 'error', message: 'Failed to copy workflow ID.' });
    }
  };

  const viewInstance = () => {
    if (!started) return;
    onClose();
    navigate(`${resourceUrl(navScope, 'workflows')}?tab=admin&workflowId=${encodeURIComponent(started.workflowId)}&env=${encodeURIComponent(scope.environmentId)}`);
  };

  if (started) {
    return (
      <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={sectionTitleSx}>Workflow Started</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mt: 1 }}>
            <strong>{started.workflowType}</strong> workflow started with workflow ID{' '}
            <Typography component="code" sx={{ fontFamily: 'monospace', fontSize: 13, bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider', borderRadius: 0.5, px: 0.75, py: 0.25 }}>
              {started.workflowId}
            </Typography>
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
          <Button startIcon={<Copy size={14} />} onClick={copyWorkflowId}>
            Copy Workflow ID
          </Button>
          <Button variant="contained" startIcon={<Eye size={14} />} onClick={viewInstance}>
            View Running Workflow
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={sectionTitleSx}>Start Workflow</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ mt: 1 }}>
          <Autocomplete
            options={definitions}
            getOptionLabel={(d) => d.workflowType}
            value={type}
            isOptionEqualToValue={(a, b) => a.workflowType === b.workflowType}
            onChange={(_, v) => {
              setSelected(v);
              setFormValues({});
              setFieldErrors({});
            }}
            renderInput={(params) => <TextField {...params} label="Workflow name" required placeholder="Select a workflow" />}
          />
          {formFields ? (
            <SchemaFormFields fields={formFields} values={formValues} errors={fieldErrors} onChange={setFormValue} />
          ) : (
            type &&
            (type.inputSchema ? (
              <SchemaDisclosure schema={type.inputSchema} />
            ) : (
              <Typography variant="caption" color="text.secondary">
                No input schema defined for this workflow.
              </Typography>
            ))
          )}
          <Stack direction="row" gap={2}>
            <TextField label="Workflow ID (optional)" fullWidth size="small" value={workflowId} onChange={(e) => setWorkflowId(e.target.value)} />
            <TextField label="Timeout (seconds)" type="number" size="small" sx={{ width: 200 }} value={timeout} onChange={(e) => setTimeoutVal(e.target.value)} placeholder="e.g. 300" slotProps={{ inputLabel: { shrink: true } }} />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!type || start.isPending} onClick={submit}>
          {start.isPending ? 'Starting…' : 'Start'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Retry tasks ────────────────────────────────────────────────────────────────

function RetryTasksAdmin({ scope, onToast }: { scope: WorkflowScope; onToast: (t: Toast) => void }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [selectedType, setSelectedType] = useState<WorkflowDefinition | null>(null);
  const timeFilter = useTimeRangeFilter();
  const { data: definitions = [] } = useWorkflowDefinitions(scope);
  const {
    data: page,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useRetryTasks(scope, {
    status: status === 'All' ? undefined : status,
    parentWorkflowId: search || undefined,
    startTimeFrom: timeFilter.bounds.startTimeFrom,
    startTimeTo: timeFilter.bounds.startTimeTo,
    limit: 50,
  });
  const decide = useRetryDecision(scope);
  const [inputTaskId, setInputTaskId] = useState<string | null>(null);

  // The retry-task API has no workflow-name filter; the qualified task name carries it, so filter client-side.
  const items = sortByStartTimeDesc((page?.items ?? []).filter((t) => !selectedType || splitQualifiedName(t.taskName ?? t.activityName).workflow === selectedType.workflowType));
  const hasFilters = status !== 'All' || !!selectedType || !!search || timeFilter.active;

  const runDecision = (taskId: string, decision: RetryDecision, parsedInput?: unknown) => {
    decide.mutate(
      { taskId, decision, input: parsedInput },
      {
        onSuccess: () => onToast({ severity: 'success', message: `Retry task ${decision} submitted.` }),
        onError: (e) => onToast({ severity: 'error', message: e instanceof Error ? e.message : 'Action failed.' }),
      },
    );
  };

  return (
    <>
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 2 }}>
        <SearchField value={search} onChange={setSearch} placeholder="Search by workflow ID" sx={{ width: 320 }} />
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={() => refetch()} aria-label="Refresh">
            <RefreshCw size={16} style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} />
          </IconButton>
        </Tooltip>
      </Stack>

      <Stack direction="row" gap={1.5} sx={{ mb: 2 }} flexWrap="wrap" alignItems="center">
        <StatusFilter options={RETRY_TASK_STATUSES} value={status} onChange={setStatus} />
        <WorkflowNameFilter definitions={definitions} value={selectedType} onChange={setSelectedType} />
        {timeFilter.controls}
        {hasFilters && (
          <Button
            size="small"
            onClick={() => {
              setStatus('All');
              setSelectedType(null);
              setSearch('');
              timeFilter.reset();
            }}>
            Clear
          </Button>
        )}
      </Stack>

      {isLoading ? (
        <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', py: 4 }} />
      ) : error ? (
        <Typography sx={emptySx}>{error instanceof Error ? error.message : 'Failed to load retry tasks.'}</Typography>
      ) : items.length === 0 ? (
        <Typography sx={emptySx}>No retry tasks found.</Typography>
      ) : (
        <ListingTable>
          <ListingTable.Head>
            <ListingTable.Row>
              <ListingTable.Cell>Task</ListingTable.Cell>
              <ListingTable.Cell>Workflow Name</ListingTable.Cell>
              <ListingTable.Cell>Workflow ID</ListingTable.Cell>
              <ListingTable.Cell>Status</ListingTable.Cell>
              <ListingTable.Cell>Started</ListingTable.Cell>
              <ListingTable.Cell>Actions</ListingTable.Cell>
            </ListingTable.Row>
          </ListingTable.Head>
          <ListingTable.Body>
            {items.map((t) => {
              const qualified = splitQualifiedName(t.taskName ?? t.activityName);
              return (
                <ListingTable.Row key={t.taskId}>
                  <ListingTable.Cell>
                    <Typography variant="body2">{qualified.task ?? t.taskId}</Typography>
                  </ListingTable.Cell>
                  <ListingTable.Cell>
                    <Typography variant="body2">{qualified.workflow ?? '—'}</Typography>
                  </ListingTable.Cell>
                  <ListingTable.Cell>
                    <Typography sx={{ fontFamily: 'monospace', fontSize: 12 }}>{t.parentWorkflowId ?? '—'}</Typography>
                  </ListingTable.Cell>
                  <ListingTable.Cell>
                    <StatusChip status={retryDisplayStatus(t.status)} />
                  </ListingTable.Cell>
                  <ListingTable.Cell>{formatTime(t.startTime)}</ListingTable.Cell>
                  <ListingTable.Cell>
                    <Authorized permissions={[Permissions.WORKFLOW_MANAGE_WORKFLOWS]}>
                      <Stack direction="row" gap={0.5}>
                        <Tooltip title="Retry with original input">
                          <IconButton size="small" disabled={decide.isPending} onClick={() => runDecision(t.taskId, 'retry')} aria-label="Retry">
                            <RotateCcw size={16} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Retry with modified input">
                          <IconButton size="small" disabled={decide.isPending} onClick={() => setInputTaskId(t.taskId)} aria-label="Retry with input">
                            <Plus size={16} />
                          </IconButton>
                        </Tooltip>
                        <Button size="small" color="error" disabled={decide.isPending} onClick={() => runDecision(t.taskId, 'fail')}>
                          Fail
                        </Button>
                      </Stack>
                    </Authorized>
                  </ListingTable.Cell>
                </ListingTable.Row>
              );
            })}
          </ListingTable.Body>
        </ListingTable>
      )}

      {inputTaskId && (
        <RetryWithInputDialog
          onClose={() => setInputTaskId(null)}
          onSubmit={(parsed) => {
            runDecision(inputTaskId, 'retry-with-input', parsed);
            setInputTaskId(null);
          }}
        />
      )}
    </>
  );
}

function RetryWithInputDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (input: unknown) => void }) {
  const [text, setText] = useState('{}');
  const [err, setErr] = useState('');
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Retry with Modified Input</DialogTitle>
      <DialogContent>
        <TextField
          label="Input (JSON object)"
          fullWidth
          multiline
          minRows={5}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setErr('');
          }}
          error={!!err}
          helperText={err}
          sx={{ mt: 1 }}
          slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 13 } } }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => {
            try {
              const parsed = JSON.parse(text);
              if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                setErr('Input must be a JSON object.');
                return;
              }
              onSubmit(parsed);
            } catch {
              setErr('Invalid JSON.');
            }
          }}>
          Retry
        </Button>
      </DialogActions>
    </Dialog>
  );
}
