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
import { useProjectByHandler, useComponentByHandler, useEnvironments } from '../api/queries';
import NotFound from '../components/NotFound';
import AdminPortal from '../components/workflow/AdminPortal';
import UserPortal from '../components/workflow/UserPortal';
import { resourceUrl, broaden, type ComponentScope } from '../nav';

export default function Workflows(scope: ComponentScope): JSX.Element {
  const { data: project, isLoading: loadingProject } = useProjectByHandler(scope.project);
  const projectId = project?.id ?? '';
  const { data: component, isLoading: loadingComponent } = useComponentByHandler(projectId, scope.component);
  const { data: environments = [], isLoading: loadingEnvs } = useEnvironments(projectId);

  // Optional deep-link params (e.g. from the Overview page's "View Instances" action):
  // ?tab=admin&type=<workflowType>&env=<environmentId>
  const [searchParams] = useSearchParams();
  const initialWorkflowType = searchParams.get('type') ?? undefined;
  const [tab, setTab] = useState(searchParams.get('tab') === 'admin' ? 1 : 0);
  const [selectedEnvId, setSelectedEnvId] = useState(searchParams.get('env') ?? '');

  if (loadingProject || loadingComponent || loadingEnvs)
    return (
      <PageContent sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
        <CircularProgress />
      </PageContent>
    );
  if (!component) return <NotFound message="Component not found" backTo={resourceUrl(broaden(scope)!, 'overview')} backLabel="Back to Project" />;

  const componentId = component.id;
  const activeEnvId = environments.some((e) => e.id === selectedEnvId) ? selectedEnvId : (environments[0]?.id ?? '');
  const selectedEnv = environments.find((e) => e.id === activeEnvId) ?? null;

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
        Manage workflow executions and human tasks for <strong>{component.displayName ?? scope.component}</strong>.
      </Typography>

      {environments.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
          No environments found for this integration.
        </Typography>
      ) : (
        <>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
            <Tabs value={tab} onChange={(_, v) => setTab(v)}>
              <Tab label="User Actions" />
              <Tab label="Admin Actions" />
            </Tabs>
          </Box>
          {!activeEnvId ? (
            <Typography color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
              Select an environment to continue.
            </Typography>
          ) : tab === 0 ? (
            <UserPortal componentId={componentId} environmentId={activeEnvId} />
          ) : (
            <AdminPortal componentId={componentId} environmentId={activeEnvId} initialWorkflowType={initialWorkflowType} />
          )}
        </>
      )}
    </PageContent>
  );
}
