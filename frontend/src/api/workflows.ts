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

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { authenticatedFetch } from '../auth/tokenManager';
import { workflowApiUrl } from '../config/api';

// ── Shared types (runtime-side shapes are loosely typed; known fields declared) ──

export interface WorkflowDefinition {
  workflowType: string;
  inputSchema?: string | null;
  isActive?: boolean;
  workerCount?: number;
}

export interface WorkflowInstance {
  workflowId: string;
  runId?: string;
  workflowType?: string;
  status?: string;
  startTime?: string;
  closeTime?: string;
  [key: string]: unknown;
}

export interface Page<T> {
  items: T[];
  nextPageToken?: string | null;
  hasMore?: boolean;
}

export interface HumanTask {
  taskId: string;
  taskName?: string;
  title?: string;
  description?: string;
  payload?: Record<string, unknown>;
  formSchema?: Record<string, unknown> | string;
  parentWorkflowId?: string;
  parentWorkflowType?: string;
  status?: string;
  startTime?: string;
  closeTime?: string;
  userRoles?: string[];
  eligibleRoles?: string[];
  canComplete?: boolean;
  result?: unknown;
  [key: string]: unknown;
}

export interface ReviewActivity {
  taskId: string;
  taskName?: string;
  activityName?: string;
  parentWorkflowId?: string;
  parentWorkflowType?: string;
  status?: string;
  trigger?: string;
  startTime?: string;
  [key: string]: unknown;
}

export interface ReviewActivityDetail extends ReviewActivity {
  title?: string;
  description?: string;
  formSchema?: Record<string, unknown> | string;
  // The arguments the gated/failed activity would run with; always conforms to formSchema.
  activityArgs?: Record<string, unknown>;
  userRoles?: string[];
  errorMessage?: string;
  closeTime?: string;
  decidedBy?: string;
  decidedAt?: string;
}

export interface HistoryEvent {
  [key: string]: unknown;
}

// ── Execution graph (node-link DAG describing the run's dependency flow) ──

export interface ExecutionGraphNode {
  id: string;
  label: string;
  /** Node kind, e.g. WORKFLOW, ACTIVITY, HUMAN_TASK, SIGNAL, TIMER. */
  type: string;
  /** Same status vocabulary as workflow instances (RUNNING, COMPLETED, FAILED, …). */
  status?: string;
  metadata?: Record<string, unknown> | null;
}

export interface ExecutionGraphEdge {
  source: string;
  target: string;
  label?: string | null;
}

export interface ExecutionGraph {
  nodes: ExecutionGraphNode[];
  edges: ExecutionGraphEdge[];
}

// ── Low-level request helper (mirrors logs.ts: timeout + error extraction) ──

async function wfRequest<T>(componentId: string, environmentId: string, subpath: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await authenticatedFetch(workflowApiUrl(componentId, environmentId, subpath), {
      ...init,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const text = await res.text();
      let message = text;
      try {
        const json = JSON.parse(text);
        message = json?.error?.message || json?.message || text;
      } catch {
        // keep raw text
      }
      const error = new Error(message || `Request failed (${res.status})`);
      (error as Error & { status?: number }).status = res.status;
      throw error;
    }
    // Some endpoints (204) have no body.
    const text = await res.text();
    return (text ? JSON.parse(text) : {}) as T;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Workflow service is unavailable. Request timed out.');
    }
    throw error;
  }
}

function jsonBody(init: RequestInit, body: unknown): RequestInit {
  return { ...init, headers: { ...(init.headers ?? {}), 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '' && v !== null) usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

// Scope-tuple used in every query key so cached data is isolated per component+env.
type Scope = { componentId: string; environmentId: string };
const enabledFor = (s: Scope) => !!s.componentId && !!s.environmentId;

// ── Definitions ──

function fetchDefinitions(componentId: string, environmentId: string): Promise<WorkflowDefinition[]> {
  return wfRequest<{ definitions: WorkflowDefinition[] }>(componentId, environmentId, 'definitions').then((d) => d.definitions ?? []);
}

export function useWorkflowDefinitions(s: Scope) {
  return useQuery({
    queryKey: ['wf', 'definitions', s.componentId, s.environmentId],
    queryFn: () => fetchDefinitions(s.componentId, s.environmentId),
    enabled: enabledFor(s),
  });
}

// ── Workflow instances ──

export interface WorkflowFilters {
  status?: string;
  workflowType?: string;
  workflowId?: string;
  startTimeFrom?: string;
  startTimeTo?: string;
  limit?: number;
  pageToken?: string;
}

function fetchWorkflowInstances(componentId: string, environmentId: string, filters: WorkflowFilters): Promise<Page<WorkflowInstance>> {
  return wfRequest<Page<WorkflowInstance>>(componentId, environmentId, `workflows${buildQuery({ ...filters })}`);
}

export function useWorkflowInstances(s: Scope, filters: WorkflowFilters) {
  return useQuery({
    queryKey: ['wf', 'instances', s.componentId, s.environmentId, filters],
    queryFn: () => fetchWorkflowInstances(s.componentId, s.environmentId, filters),
    enabled: enabledFor(s),
  });
}

export function useWorkflowInfo(s: Scope, workflowId: string | null) {
  return useQuery({
    queryKey: ['wf', 'info', s.componentId, s.environmentId, workflowId],
    queryFn: () => wfRequest<WorkflowInstance>(s.componentId, s.environmentId, `workflows/${encodeURIComponent(workflowId!)}`),
    enabled: enabledFor(s) && !!workflowId,
  });
}

export function useWorkflowHistory(s: Scope, workflowId: string | null) {
  return useQuery({
    queryKey: ['wf', 'history', s.componentId, s.environmentId, workflowId],
    queryFn: () => wfRequest<{ events: HistoryEvent[] }>(s.componentId, s.environmentId, `workflows/${encodeURIComponent(workflowId!)}/history`).then((d) => d.events ?? []),
    enabled: enabledFor(s) && !!workflowId,
  });
}

export function useWorkflowExecutionGraph(s: Scope, workflowId: string | null) {
  return useQuery({
    queryKey: ['wf', 'graph', s.componentId, s.environmentId, workflowId],
    queryFn: () => wfRequest<ExecutionGraph>(s.componentId, s.environmentId, `workflows/${encodeURIComponent(workflowId!)}/execution-graph`),
    enabled: enabledFor(s) && !!workflowId,
  });
}

export function useStartWorkflow(s: Scope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { workflowType: string; input?: unknown; workflowId?: string; timeoutSeconds?: number }) => wfRequest<WorkflowInstance>(s.componentId, s.environmentId, 'workflows', jsonBody({ method: 'POST' }, body)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wf', 'instances', s.componentId, s.environmentId] }),
  });
}

export type WorkflowLifecycleAction = 'suspend' | 'resume' | 'cancel' | 'terminate';

export function useWorkflowLifecycle(s: Scope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ workflowId, action, reason }: { workflowId: string; action: WorkflowLifecycleAction; reason?: string }) => {
      const init = action === 'terminate' ? jsonBody({ method: 'POST' }, { reason: reason ?? '' }) : { method: 'POST' };
      return wfRequest<unknown>(s.componentId, s.environmentId, `workflows/${encodeURIComponent(workflowId)}/${action}`, init);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wf', 'instances', s.componentId, s.environmentId] });
      qc.invalidateQueries({ queryKey: ['wf', 'info', s.componentId, s.environmentId] });
    },
  });
}

// ── Human tasks ──

export interface HumanTaskFilters {
  status?: string;
  parentWorkflowId?: string;
  parentWorkflowType?: string;
  taskName?: string;
  limit?: number;
  pageToken?: string;
}

function fetchHumanTasks(componentId: string, environmentId: string, filters: HumanTaskFilters): Promise<Page<HumanTask>> {
  return wfRequest<Page<HumanTask>>(componentId, environmentId, `human-tasks${buildQuery({ ...filters })}`);
}

export function useHumanTasks(s: Scope, filters: HumanTaskFilters) {
  return useQuery({
    queryKey: ['wf', 'human-tasks', s.componentId, s.environmentId, filters],
    queryFn: () => fetchHumanTasks(s.componentId, s.environmentId, filters),
    enabled: enabledFor(s),
  });
}

function fetchPendingTaskCount(componentId: string, environmentId: string): Promise<number> {
  return wfRequest<{ count: number }>(componentId, environmentId, 'human-tasks/pending-count').then((d) => d.count ?? 0);
}

export function usePendingTaskCount(s: Scope) {
  return useQuery({
    queryKey: ['wf', 'pending-count', s.componentId, s.environmentId],
    queryFn: () => fetchPendingTaskCount(s.componentId, s.environmentId),
    enabled: enabledFor(s),
    refetchInterval: 30000,
  });
}

// Query options for one task's detail; shared by useHumanTask and useQueries-based batch fetches.
export function humanTaskQueryOptions(s: Scope, taskId: string) {
  return {
    queryKey: ['wf', 'human-task', s.componentId, s.environmentId, taskId] as const,
    queryFn: () => wfRequest<HumanTask>(s.componentId, s.environmentId, `human-tasks/${encodeURIComponent(taskId)}`),
  };
}

export function useHumanTask(s: Scope, taskId: string | null) {
  return useQuery({
    ...humanTaskQueryOptions(s, taskId ?? ''),
    enabled: enabledFor(s) && !!taskId,
  });
}

function invalidateHumanTasks(qc: ReturnType<typeof useQueryClient>, s: Scope) {
  qc.invalidateQueries({ queryKey: ['wf', 'human-tasks', s.componentId, s.environmentId] });
  qc.invalidateQueries({ queryKey: ['wf', 'pending-count', s.componentId, s.environmentId] });
}

export function useCompleteHumanTask(s: Scope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, result }: { taskId: string; result: unknown }) => wfRequest<unknown>(s.componentId, s.environmentId, `human-tasks/${encodeURIComponent(taskId)}/complete`, jsonBody({ method: 'POST' }, { result })),
    onSuccess: () => invalidateHumanTasks(qc, s),
  });
}

export function useFailHumanTask(s: Scope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, reason, details }: { taskId: string; reason: string; details?: unknown }) => wfRequest<unknown>(s.componentId, s.environmentId, `human-tasks/${encodeURIComponent(taskId)}/fail`, jsonBody({ method: 'POST' }, { reason, details })),
    onSuccess: () => invalidateHumanTasks(qc, s),
  });
}

// ── Review activities ──
// (Replaces the deprecated retry-tasks routes; the runtime still exposes /retry-tasks
// for pre-0.7.0 clients but the UI uses /review-activities.)

export interface ReviewActivityFilters {
  status?: string;
  parentWorkflowId?: string;
  taskName?: string;
  startTimeFrom?: string;
  startTimeTo?: string;
  limit?: number;
  pageToken?: string;
}

// Review-activity pages are fetched and combined up to this many pages so client-side
// filters (e.g. by workflow name, which the runtime API cannot filter on) see the
// full set rather than only the first page.
const REVIEW_ACTIVITY_MAX_PAGES = 20;

async function fetchReviewActivities(componentId: string, environmentId: string, filters: ReviewActivityFilters): Promise<Page<ReviewActivity>> {
  const items: ReviewActivity[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < REVIEW_ACTIVITY_MAX_PAGES; i++) {
    const page = await wfRequest<Page<ReviewActivity>>(componentId, environmentId, `review-activities${buildQuery({ ...filters, pageToken })}`);
    items.push(...(page.items ?? []));
    if (!page.hasMore || !page.nextPageToken) return { items, hasMore: false };
    pageToken = page.nextPageToken;
  }
  return { items, hasMore: true };
}

export function useReviewActivities(s: Scope, filters: ReviewActivityFilters) {
  return useQuery({
    queryKey: ['wf', 'review-activities', s.componentId, s.environmentId, filters],
    queryFn: () => fetchReviewActivities(s.componentId, s.environmentId, filters),
    enabled: enabledFor(s),
  });
}

export function reviewActivityQueryOptions(s: Scope, taskId: string) {
  return {
    queryKey: ['wf', 'review-activity', s.componentId, s.environmentId, taskId] as const,
    queryFn: () => wfRequest<ReviewActivityDetail>(s.componentId, s.environmentId, `review-activities/${encodeURIComponent(taskId)}`),
  };
}

export function useReviewActivity(s: Scope, taskId: string | null) {
  return useQuery({
    ...reviewActivityQueryOptions(s, taskId ?? ''),
    enabled: enabledFor(s) && !!taskId,
  });
}

export type ReviewDecision = 'proceed' | 'proceed-with-input' | 'reject';

export function useReviewDecision(s: Scope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, decision, input, feedback }: { taskId: string; decision: ReviewDecision; input?: unknown; feedback?: string }) => {
      let init: RequestInit;
      if (decision === 'proceed-with-input') init = jsonBody({ method: 'POST' }, { input });
      else if (decision === 'reject') init = jsonBody({ method: 'POST' }, { feedback });
      else init = { method: 'POST' };
      return wfRequest<unknown>(s.componentId, s.environmentId, `review-activities/${encodeURIComponent(taskId)}/${decision}`, init);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wf', 'review-activities', s.componentId, s.environmentId] }),
  });
}

// ── Project-scope aggregation ────────────────────────────────────────────────
//
// A workflow instance or task id is only unique inside the runtime that owns it, so every row an
// aggregated list yields carries the integration it came from; detail views and mutations then
// target that integration's runtime rather than a page-level scope.
//
// The fan-out is deliberately client-side. /icp/workflow authorizes per component, so a caller
// holding integration-scoped permission sees exactly the integrations it may see. A single
// project-scope check could not do that: getUserEffectivePermissions appends
// `AND grm.integration_uuid IS NULL` when no integration is supplied, which drops
// integration-specific role mappings. Per-component requests also mean one dead or workflow-less
// runtime degrades its own row rather than failing the page.

export interface WorkflowTarget {
  componentId: string;
  componentName: string;
}

/** A row tagged with the integration whose runtime produced it. */
export type Owned<T> = T & { componentId: string; componentName: string };

export interface Aggregated<T> {
  items: Owned<T>[];
  isLoading: boolean;
  isFetching: boolean;
  /** Set only when no target returned data and at least one failed for a real reason. */
  error: Error | null;
  /** Targets that failed while others succeeded, so a partial list can say so. */
  failed: { componentName: string; message: string }[];
  /** True when any target had more rows than were fetched. */
  hasMore: boolean;
  refetch: () => void;
}

/**
 * Statuses that mean "this integration has nothing to contribute" rather than "something broke":
 * 503 (no running workflow runtime in this environment), 403 (caller may not see this
 * integration's workflows) and 404 (component or runtime gone). They are dropped silently, so a
 * project mixing workflow and non-workflow integrations reads cleanly.
 */
function isAbsent(e: unknown): boolean {
  const status = (e as { status?: number } | null | undefined)?.status;
  return status === 403 || status === 404 || status === 503;
}

/** Runs one page request per target and merges the results, tagging each row with its owner. */
function useAcrossTargets<T>(targets: WorkflowTarget[], environmentId: string, makeKey: (componentId: string) => readonly unknown[], fetchOne: (componentId: string) => Promise<Page<T>>): Aggregated<T> {
  const results = useQueries({
    queries: targets.map((t) => ({
      queryKey: makeKey(t.componentId),
      queryFn: () => fetchOne(t.componentId),
      enabled: !!environmentId && !!t.componentId,
    })),
  });

  const items: Owned<T>[] = [];
  const failed: { componentName: string; message: string }[] = [];
  results.forEach((r, i) => {
    const target = targets[i];
    if (!target) return;
    for (const item of r.data?.items ?? []) {
      items.push({ ...item, componentId: target.componentId, componentName: target.componentName });
    }
    if (r.error && !isAbsent(r.error)) {
      failed.push({ componentName: target.componentName, message: r.error instanceof Error ? r.error.message : 'Request failed' });
    }
  });

  const anySucceeded = results.some((r) => r.data !== undefined);
  return {
    items,
    isLoading: results.some((r) => r.isLoading),
    isFetching: results.some((r) => r.isFetching),
    error: !anySucceeded && failed.length > 0 ? new Error(failed[0].message) : null,
    failed,
    hasMore: results.some((r) => r.data?.hasMore === true),
    refetch: () => results.forEach((r) => void r.refetch()),
  };
}

export function useWorkflowInstancesAcross(targets: WorkflowTarget[], environmentId: string, filters: WorkflowFilters): Aggregated<WorkflowInstance> {
  return useAcrossTargets<WorkflowInstance>(
    targets,
    environmentId,
    (cid) => ['wf', 'instances', cid, environmentId, filters],
    (cid) => fetchWorkflowInstances(cid, environmentId, filters),
  );
}

export function useHumanTasksAcross(targets: WorkflowTarget[], environmentId: string, filters: HumanTaskFilters): Aggregated<HumanTask> {
  return useAcrossTargets<HumanTask>(
    targets,
    environmentId,
    (cid) => ['wf', 'human-tasks', cid, environmentId, filters],
    (cid) => fetchHumanTasks(cid, environmentId, filters),
  );
}

export function useReviewActivitiesAcross(targets: WorkflowTarget[], environmentId: string, filters: ReviewActivityFilters): Aggregated<ReviewActivity> {
  return useAcrossTargets<ReviewActivity>(
    targets,
    environmentId,
    (cid) => ['wf', 'review-activities', cid, environmentId, filters],
    (cid) => fetchReviewActivities(cid, environmentId, filters),
  );
}

/**
 * Workflow definitions across the targets, de-duplicated by workflow type — the name filter offers
 * one entry per type even when several integrations expose the same workflow.
 */
export function useWorkflowDefinitionsAcross(targets: WorkflowTarget[], environmentId: string): WorkflowDefinition[] {
  const { items } = useAcrossTargets<WorkflowDefinition>(
    targets,
    environmentId,
    (cid) => ['wf', 'definitions', cid, environmentId],
    (cid) => fetchDefinitions(cid, environmentId).then((definitions) => ({ items: definitions })),
  );
  const byType = new Map<string, WorkflowDefinition>();
  for (const d of items) {
    if (!byType.has(d.workflowType)) byType.set(d.workflowType, d);
  }
  return [...byType.values()];
}

/** Summed pending-task count across the targets; undefined until at least one target has answered. */
export function usePendingTaskCountAcross(targets: WorkflowTarget[], environmentId: string): number | undefined {
  const results = useQueries({
    queries: targets.map((t) => ({
      queryKey: ['wf', 'pending-count', t.componentId, environmentId],
      queryFn: () => fetchPendingTaskCount(t.componentId, environmentId),
      enabled: !!environmentId && !!t.componentId,
      refetchInterval: 30000,
    })),
  });
  // Left undefined until something has answered so the chip doesn't flash "0 pending" on load.
  if (!results.some((r) => r.data !== undefined)) return undefined;
  return results.reduce((sum, r) => sum + (r.data ?? 0), 0);
}
