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

import { Autocomplete, Box, CircularProgress, PageContent, Stack, Tab, Tabs, TextField, Typography } from '@wso2/oxygen-ui';
import { useState, type JSX } from 'react';
import { useSearchParams } from 'react-router';
import { useProjectByHandler, useComponentByHandler, useComponents, useEnvironments } from '../api/queries';
import NotFound from '../components/NotFound';
import AdminPortal from '../components/workflow/AdminPortal';
import UserPortal from '../components/workflow/UserPortal';
import { useAccessControl } from '../contexts/AccessControlContext';
import { useLoadComponentPermissions, useLoadProjectPermissions } from '../hooks/usePermissionLoader';
import { Permissions } from '../constants/permissions';
import { resourceUrl, broaden, hasComponent, type ComponentScope, type ProjectScope } from '../nav';
import type { WorkflowTarget } from '../api/workflows';
import { isWorkflowIntegration } from '../constants/integrationTypes';

export default function Workflows(scope: ComponentScope | ProjectScope): JSX.Element {
  const componentLevel = hasComponent(scope);
  const { data: project, isLoading: loadingProject } = useProjectByHandler(scope.project);
  const projectId = project?.id ?? '';
  const { data: component, isLoading: loadingComponent } = useComponentByHandler(projectId, componentLevel ? scope.component : undefined);
  // At project scope the portals span every integration in the project; at component scope, just one.
  const { data: allComponents = [], isLoading: loadingComponents } = useComponents(scope.org, projectId);
  const { data: environments = [], isLoading: loadingEnvs } = useEnvironments(projectId);
  const componentId = component?.id ?? '';

  // Gate on this component's permissions at component scope, the project's at project scope.
  // Note the project-scope limit: the backend resolves project-scope permissions with
  // `AND grm.integration_uuid IS NULL`, so a user holding workflow permission only on individual
  // integrations does not pass this gate and must use the per-integration page. Note that a project's
  // workflow data is namespace-wide, so this gate is what bounds what a project-scope viewer sees;
  // it is not narrowed further per integration.
  useLoadComponentPermissions(scope.org, projectId, componentLevel ? componentId : '');
  useLoadProjectPermissions(scope.org, projectId);
  const { hasAnyPermission } = useAccessControl();

  // `handler` is what a runtime is configured with as its Temporal task queue, so it is how a
  // record's own taskQueue maps back to the integration that owns it.
  const targets: WorkflowTarget[] = componentLevel
    ? component
      ? [{ componentId: component.id, componentName: component.displayName ?? component.name, handler: component.handler }]
      : []
    : // Every project-scope read goes through targets[0], so integrations typed as Workflow are put
      // first — otherwise whichever integration happened to sort first becomes the gateway, and a
      // runtime with no workflow engine cannot answer for the project. The others are kept rather
      // than filtered out: workflow management is enabled per runtime (the Add Runtime toggle is
      // gated on technology, not on integration type), so a differently-typed integration may still
      // host workflows and must stay in the definitions fan-out and the task-queue lookup. Copied
      // before sorting so the cached component list is not mutated; sort is stable, so integrations
      // keep their relative order within each group.
      [...allComponents].sort((a, b) => Number(isWorkflowIntegration(b.displayType)) - Number(isWorkflowIntegration(a.displayType))).map((c) => ({ componentId: c.id, componentName: c.displayName ?? c.name, handler: c.handler }));
  // The project shares one Temporal namespace, so a listing is narrowed by task queue rather than by
  // which runtime is called: this integration's queue at component scope, the whole namespace at
  // project scope.
  const taskQueue = componentLevel ? component?.handler : undefined;

  // Optional deep-link params (e.g. from the Overview page's "View Instances" action or the
  // start-workflow success dialog): ?tab=admin&type=<workflowType>&workflowId=<id>&env=<environmentId>
  const [searchParams, setSearchParams] = useSearchParams();
  const initialWorkflowType = searchParams.get('type') ?? undefined;
  const initialWorkflowId = searchParams.get('workflowId') ?? undefined;
  // The active tab is driven by the URL, so navigating here from elsewhere (e.g. clicking a
  // workflow ID in User Actions or Review Activities) switches tabs deterministically.
  const tabKey: 'user' | 'admin' = searchParams.get('tab') === 'admin' ? 'admin' : 'user';
  const setTabKey = (v: 'user' | 'admin') =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', v);
        return next;
      },
      { replace: true },
    );
  const [selectedEnvId, setSelectedEnvId] = useState(searchParams.get('env') ?? '');

  // Deep-link params seed component state once; remount the admin portal when they change so
  // in-page navigation (e.g. "View Instance" from the start dialog) re-applies them.
  const deepLinkKey = `${initialWorkflowType ?? ''}:${initialWorkflowId ?? ''}`;

  if (loadingProject || loadingComponent || loadingEnvs || loadingComponents)
    return (
      <PageContent sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
        <CircularProgress />
      </PageContent>
    );
  if (componentLevel && !component) return <NotFound message="Component not found" backTo={resourceUrl(broaden(scope)!, 'overview')} backLabel="Back to Project" />;

  const activeEnvId = environments.some((e) => e.id === selectedEnvId) ? selectedEnvId : (environments[0]?.id ?? '');
  const selectedEnv = environments.find((e) => e.id === activeEnvId) ?? null;
  // Each tab is gated by its dedicated workflow permission.
  const permScope = componentLevel ? componentId : undefined;
  const canViewHumanTasks = hasAnyPermission([Permissions.WORKFLOW_VIEW_HUMAN_TASKS, Permissions.WORKFLOW_MANAGE_HUMAN_TASKS], projectId, permScope);
  const canViewWorkflows = hasAnyPermission([Permissions.WORKFLOW_VIEW_WORKFLOWS, Permissions.WORKFLOW_MANAGE_WORKFLOWS], projectId, permScope);
  // Resolve the requested tab to one the user is allowed to see (null = neither).
  const activeTab: 'user' | 'admin' | null = tabKey === 'admin' && canViewWorkflows ? 'admin' : tabKey === 'user' && canViewHumanTasks ? 'user' : canViewHumanTasks ? 'user' : canViewWorkflows ? 'admin' : null;

  return (
    <PageContent>
      <Stack component="header" direction="row" alignItems="center" justifyContent="space-between" gap={2} sx={{ mb: 1 }}>
        <Typography variant="h1">Workflows</Typography>
        <Autocomplete
          size="small"
          sx={{ width: 280 }}
          options={environments}
          getOptionLabel={(e) => e.name}
          value={selectedEnv}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          onChange={(_, v) => setSelectedEnvId(v?.id ?? '')}
          renderInput={(params) => <TextField {...params} label="Environment" placeholder="Select environment" />}
        />
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {componentLevel ? (
          <>
            Manage workflow executions and human tasks for <strong>{component?.displayName ?? scope.component}</strong>.
          </>
        ) : (
          <>
            Manage workflow executions and human tasks across all integrations in <strong>{project?.name ?? scope.project}</strong>.
          </>
        )}
      </Typography>

      {environments.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
          {componentLevel ? 'No environments found for this integration.' : 'No environments found for this project.'}
        </Typography>
      ) : activeTab === null ? (
        <Typography color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
          {componentLevel ? 'You do not have permission to view workflows for this integration.' : 'You do not have permission to view workflows for this project.'}
        </Typography>
      ) : (
        <>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
            <Tabs value={activeTab} onChange={(_, v) => setTabKey(v as 'user' | 'admin')}>
              {canViewHumanTasks && <Tab label="User Actions" value="user" />}
              {canViewWorkflows && <Tab label="Admin Actions" value="admin" />}
            </Tabs>
          </Box>
          {!activeEnvId ? (
            <Typography color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
              Select an environment to continue.
            </Typography>
          ) : activeTab === 'user' ? (
            <UserPortal targets={targets} environmentId={activeEnvId} taskQueue={taskQueue} />
          ) : (
            <AdminPortal key={deepLinkKey} targets={targets} environmentId={activeEnvId} taskQueue={taskQueue} initialWorkflowType={initialWorkflowType} initialWorkflowId={initialWorkflowId} />
          )}
        </>
      )}
    </PageContent>
  );
}
