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
import { Alert, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Divider, IconButton, MenuItem, PageContent, Select, Stack, TextField, Tooltip, Typography } from '@wso2/oxygen-ui';
import { BarChart3, Download, RefreshCw } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { useProjectByHandler, useComponentByHandler, useComponents, useEnvironments } from '../api/queries';
import { useMoesifMetricsConfig, useConfigureMoesifMetrics, useCreateMoesifDashboards, useMoesifDashboardEmbed } from '../api/metricsMoesif';
import { downloadMoesifMetricsTemplate, MOESIF_METRICS_WORKSPACE_NAME } from '../assets/moesifMetricsTemplate';
import CodeBoxWithCopy from '../components/CodeBoxWithCopy';
import EmptyListing from '../components/EmptyListing';
import NotFound from '../components/NotFound';
import { resourceUrl, broaden, hasComponent } from '../nav';
import type { MetricsPageProps } from './MetricsOpenSearch';

// Read scopes required on the Moesif Management API Key so the backend can list
// dashboards (to discover the imported workspace) and mint embed access tokens.
const REQUIRED_ENTITY_SCOPES: { entity: string; actions: string[] }[] = [
  { entity: 'Dashboards', actions: ['read'] },
  { entity: 'Workspaces', actions: ['read'] },
];

const MOESIF_MAIN_BAL_IMPORT = 'import ballerinax/moesif as _;';

// Build the metrics-only Config.toml snippet for publishing metrics to Moesif.
// Based on https://ballerina.io/learn/supported-observability-tools-and-platforms/moesif/
function moesifConfigToml(applicationId: string): string {
  return `[ballerina.observe]
metricsEnabled = true
metricsReporter = "moesif"

[ballerinax.moesif]
applicationId = "${applicationId}"          # Mandatory. Your Moesif Collector Application ID.
reporterBaseUrl = "https://api.moesif.net"  # Optional. Default: https://api.moesif.net
metricsReporterFlushInterval = 15000        # Optional. Default: 15000 (ms)
metricsReporterClientTimeout = 10000        # Optional. Default: 10000 (ms)`;
}

// Popup showing the runtime configuration instructions for publishing metrics to Moesif.
function MoesifInstructionsDialog({ applicationId, open, onClose }: { applicationId: string; open: boolean; onClose: () => void }): JSX.Element {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Configure Moesif Metrics</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 1 }}>
          Add the following import to your runtime's <strong>main.bal</strong> file:
        </DialogContentText>
        <CodeBoxWithCopy code={MOESIF_MAIN_BAL_IMPORT} />

        <DialogContentText sx={{ mb: 1, mt: 2 }}>
          Add the following configuration to your runtime's <strong>Config.toml</strong> file:
        </DialogContentText>
        <CodeBoxWithCopy code={moesifConfigToml(applicationId)} />

        <Alert severity="info" sx={{ mt: 2 }}>
          After applying this configuration you need to <strong>restart the runtime</strong> for it to start publishing metrics to Moesif.
        </Alert>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

// Step 1: Configure the runtime to publish metrics to Moesif. Persists the
// Collector Application ID against the integration (project + component combo).
// When `currentAppId` is provided the card is in edit mode: the field is
// pre-filled with the existing ID (masked) so the user can update it, and an
// optional Cancel action returns to the previous view.
function MoesifRuntimeConfigCard({ onSave, saving, error, currentAppId, onCancel }: { onSave: (collectorAppId: string) => void; saving: boolean; error: unknown; currentAppId?: string; onCancel?: () => void }): JSX.Element {
  const isEdit = !!currentAppId;
  const [appId, setAppId] = useState(currentAppId ?? '');
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const trimmedAppId = appId.trim();
  const unchanged = isEdit && trimmedAppId === (currentAppId ?? '').trim();
  const effectiveAppId = trimmedAppId || '<MOESIF_COLLECTOR_APPLICATION_ID>';
  return (
    <Card variant="outlined" sx={{ maxWidth: 720, mx: 'auto', mt: 2 }}>
      <CardContent>
        <Typography variant="h6" sx={{ mb: 1 }}>
          {isEdit ? 'Update Collector Application ID' : 'Configure Moesif Metrics'}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          Provide your Moesif <strong>Collector Application ID</strong> and configure your Ballerina runtime to publish metrics to Moesif. You can find the Collector Application ID in the Moesif portal under{' '}
          <strong>Account → Settings → API Keys → Collector Application ID</strong>.
        </Typography>

        <TextField
          label="Collector Application ID"
          placeholder="Paste your Moesif Collector Application ID"
          value={appId}
          onChange={(e) => setAppId(e.target.value)}
          type={isEdit ? 'password' : 'text'}
          fullWidth
          size="small"
          autoComplete="off"
          helperText={isEdit ? 'The current ID is hidden. Replace it to update, or cancel to keep it.' : undefined}
          sx={{ mb: 2 }}
        />

        <Alert severity="info" sx={{ mb: 2 }}>
          After saving, apply the configuration instructions to your runtime and <strong>restart the runtime</strong> so it starts publishing metrics to Moesif.
        </Alert>

        {!!error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {(error as Error).message || 'Failed to save the Moesif configuration.'}
          </Alert>
        )}

        <Stack direction="row" gap={1}>
          <Button variant="outlined" onClick={() => setInstructionsOpen(true)}>
            View configuration instructions
          </Button>
          {isEdit && onCancel && (
            <Button variant="text" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
          )}
          <Button variant="contained" disabled={!trimmedAppId || saving || unchanged} onClick={() => onSave(trimmedAppId)}>
            {isEdit ? (saving ? 'Updating…' : 'Update configuration') : saving ? 'Saving…' : 'Save configuration'}
          </Button>
        </Stack>
      </CardContent>

      <MoesifInstructionsDialog applicationId={effectiveAppId} open={instructionsOpen} onClose={() => setInstructionsOpen(false)} />
    </Card>
  );
}

// Step 2: Link the metrics dashboard. The user downloads the ICP metrics
// template, imports it into Moesif (creating the "Application Metrics" dashboard
// and its workspace), sets that workspace's sharing to Public, then provides a
// Moesif Management API Key. The token + Application ID are sent to the backend,
// which discovers the imported dashboard's workspace id and persists it against
// the integration (setting the `dashboardsCreated` flag). Workspaces can't be
// created via the API with public sharing, hence the manual import + Public step.
//
// When `isEdit` is set the card is in update mode for an already-linked
// dashboard: the template download + import instructions stay available (so the
// user can re-download the template or re-check the steps at any time) and the
// user supplies a new Management API Key + Moesif Application ID to re-link (the
// backend re-discovers the workspace and overwrites the stored credentials). An
// optional Cancel action returns to the metrics view.
function MoesifDashboardCard({
  applicationId,
  onCreate,
  creating,
  error,
  onEditAppId,
  isEdit,
  onCancel,
}: {
  applicationId: string;
  onCreate: (token: string, moesifAppId: string) => void;
  creating: boolean;
  error: unknown;
  onEditAppId?: () => void;
  isEdit?: boolean;
  onCancel?: () => void;
}): JSX.Element {
  const [token, setToken] = useState('');
  const [moesifAppId, setMoesifAppId] = useState('');
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const effectiveAppId = applicationId.trim() || '<MOESIF_COLLECTOR_APPLICATION_ID>';
  return (
    <Card variant="outlined" sx={{ maxWidth: 720, mx: 'auto', mt: 2 }}>
      <CardContent>
        {!isEdit && onEditAppId && (
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ mb: 2 }} flexWrap="wrap">
            <Typography variant="body2" color="text.secondary">
              Collector Application ID: <strong>••••••••</strong>
            </Typography>
            <Button size="small" onClick={onEditAppId}>
              Change
            </Button>
          </Stack>
        )}

        <Typography variant="h6" sx={{ mb: 1 }}>
          {isEdit ? 'Update dashboard credentials' : 'Set up the metrics dashboard'}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          {isEdit
            ? 'If you have not imported the metrics dashboard into Moesif yet, follow the steps below. Then provide a new Management API Key and Moesif Application ID to re-link the dashboard.'
            : 'Import the metrics dashboard template into Moesif, make its workspace public, then link it here.'}
        </Typography>

        <Stack component="ol" sx={{ pl: 2.5, mb: 2, '& li': { mb: 1 } }} gap={0.5}>
          <li>
            <Typography variant="body2">Download the metrics dashboard template.</Typography>
            <Button size="small" variant="outlined" startIcon={<Download size={16} />} onClick={downloadMoesifMetricsTemplate} sx={{ mt: 1 }}>
              Download template
            </Button>
          </li>
          <li>
            <Typography variant="body2">
              In Moesif, go to <strong>Dashboards → Import</strong> and import the downloaded file. This creates the <strong>Application Metrics</strong> dashboard and its <strong>{MOESIF_METRICS_WORKSPACE_NAME}</strong> workspace.
            </Typography>
          </li>
          <li>
            <Typography variant="body2">
              Open the <strong>{MOESIF_METRICS_WORKSPACE_NAME}</strong> workspace, click <strong>Share</strong>, and set its sharing to <strong>Public</strong>. This is required for the embedded chart to load.
            </Typography>
          </li>
          <li>
            <Typography variant="body2">
              Provide a Moesif <strong>Management API Key</strong> (with the read scopes below) and your <strong>Moesif Application ID</strong>, then {isEdit ? 'update the credentials' : 'link the dashboard'}.
            </Typography>
          </li>
        </Stack>

        <Stack gap={1.5} sx={{ mb: 2 }}>
          {REQUIRED_ENTITY_SCOPES.map(({ entity, actions }) => (
            <Stack key={entity} direction="row" alignItems="center" gap={1} flexWrap="wrap">
              <Typography variant="body2" sx={{ minWidth: 90, fontWeight: 600 }}>
                {entity}
              </Typography>
              {actions.map((a) => (
                <Chip key={a} label={a} size="small" variant="outlined" />
              ))}
            </Stack>
          ))}
        </Stack>

        <Divider sx={{ my: 2 }} />

        <TextField label="Management API Key" placeholder="Paste your Moesif Management API Key" value={token} onChange={(e) => setToken(e.target.value)} type="password" fullWidth size="small" autoComplete="off" sx={{ mb: 2 }} />

        <TextField label="Moesif Application ID" placeholder="Enter the Moesif Application ID" value={moesifAppId} onChange={(e) => setMoesifAppId(e.target.value)} fullWidth size="small" autoComplete="off" sx={{ mb: 2 }} />

        {!!error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {(error as Error).message || 'Failed to link the Moesif dashboard.'}
          </Alert>
        )}

        <Stack direction="row" gap={1}>
          <Button variant="outlined" onClick={() => setInstructionsOpen(true)}>
            View configuration instructions
          </Button>
          {isEdit && onCancel && (
            <Button variant="text" onClick={onCancel} disabled={creating}>
              Cancel
            </Button>
          )}
          <Button variant="contained" disabled={!token.trim() || !moesifAppId.trim() || creating} onClick={() => onCreate(token.trim(), moesifAppId.trim())}>
            {isEdit ? (creating ? 'Updating…' : 'Update credentials') : creating ? 'Linking…' : 'Link dashboard'}
          </Button>
        </Stack>
      </CardContent>

      <MoesifInstructionsDialog applicationId={effectiveAppId} open={instructionsOpen} onClose={() => setInstructionsOpen(false)} />
    </Card>
  );
}

export default function MetricsMoesif({ scope, backendSelector }: MetricsPageProps): JSX.Element {
  const isComponent = hasComponent(scope);
  const { data: project, isLoading: loadingProject } = useProjectByHandler(scope.project);
  const projectId = project?.id ?? '';
  const { data: singleComponent, isLoading: loadingComponent } = useComponentByHandler(projectId, isComponent ? scope.component : undefined);
  const { data: components = [], isLoading: loadingComponents } = useComponents(scope.org, projectId);
  const { data: environments = [], isLoading: loadingEnvironments } = useEnvironments(projectId);
  const biComponents = components.filter((component) => component.componentType === 'BI');

  const [integrationFilter, setIntegrationFilter] = useState('all');
  // When set, the Collector Application ID edit form is shown for an already
  // configured integration so the user can update the stored ID.
  const [editingAppId, setEditingAppId] = useState(false);
  // When set, the dashboard-credentials edit form is shown for an already-linked
  // integration so the user can update the stored Management API Key + Moesif
  // Application ID (re-linking the dashboard via the backend discovery flow).
  const [editingDashboard, setEditingDashboard] = useState(false);

  const componentId = isComponent ? (singleComponent?.id ?? '') : '';

  // The integration (project + component combo) whose Moesif configuration is
  // being viewed/configured. Component scope targets the single component;
  // project scope targets a BI integration chosen via the integration filter.
  // Re-check the selected ID against the filtered list so a stale or manually
  // supplied non-BI value can never be used for Moesif requests.
  const selectedBiComponentId = biComponents.some((component) => component.id === integrationFilter) ? integrationFilter : '';
  const targetComponentId = isComponent ? componentId : selectedBiComponentId;

  // Whether this integration is already configured for Moesif metrics (a
  // Collector Application ID has been stored against it) and whether its Moesif
  // dashboards have been created. Both flags come from the backend and drive the
  // wizard steps.
  const { data: moesifConfig, isLoading: loadingMoesifConfig } = useMoesifMetricsConfig(targetComponentId || undefined);
  const configureMoesif = useConfigureMoesifMetrics();
  const createDashboards = useCreateMoesifDashboards();
  const configured = !!moesifConfig?.configured;
  const configuredAppId = moesifConfig?.applicationId ?? '';
  const dashboardsCreated = !!moesifConfig?.dashboardsCreated;

  // Once the dashboards exist, mint a short-lived workspace access token and
  // build the iframe embed URL. The hook refetches before the token expires.
  const { data: embed, isLoading: loadingEmbed, isFetching: fetchingEmbed, error: embedError, refetch: refetchEmbed } = useMoesifDashboardEmbed(targetComponentId || undefined, dashboardsCreated);

  const header = (
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
      <Typography variant="h1">Metrics</Typography>
      <Stack direction="row" alignItems="center" gap={1}>
        {backendSelector}
        {dashboardsCreated && (
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={() => refetchEmbed()} disabled={fetchingEmbed}>
              <RefreshCw size={18} />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
    </Stack>
  );

  // Early returns
  const loadingContext = isComponent ? loadingComponent : loadingComponents;
  if (loadingProject || loadingContext || loadingEnvironments) {
    return (
      <PageContent sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
        <CircularProgress />
      </PageContent>
    );
  }
  if (!project) {
    return <NotFound message="Project not found" backTo={resourceUrl(broaden(scope)!, 'overview')} backLabel="Back to Organization" />;
  }
  if (isComponent && !singleComponent) {
    return <NotFound message="Component not found" backTo={resourceUrl(broaden(scope)!, 'overview')} backLabel="Back to Project" />;
  }
  if (environments.length === 0) {
    return (
      <PageContent>
        {header}
        <EmptyListing icon={<BarChart3 size={48} />} title="No environments" description="Configure an environment to view metrics." />
      </PageContent>
    );
  }

  // Project scope: an integration must be selected before we can check or set
  // its Moesif configuration (config is stored per project + integration combo).
  if (!isComponent && !targetComponentId) {
    return (
      <PageContent>
        {header}
        <Card variant="outlined" sx={{ maxWidth: 720, mx: 'auto', mt: 2 }}>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1 }}>
              Select an integration
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Moesif metrics are configured per integration. Select an integration to configure or view its metrics.
            </Typography>
            {biComponents.length > 0 ? (
              <Select value={integrationFilter} onChange={(e) => setIntegrationFilter(e.target.value as string)} size="small" sx={{ minWidth: 240 }} inputProps={{ 'aria-label': 'Integration' }}>
                <MenuItem value="all">Select an integration…</MenuItem>
                {biComponents.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.displayName}
                  </MenuItem>
                ))}
              </Select>
            ) : (
              <EmptyListing icon={<BarChart3 size={48} />} title="No BI integrations" description="Create a BI integration to configure Moesif metrics." />
            )}
          </CardContent>
        </Card>
      </PageContent>
    );
  }

  // Resolving whether this integration is configured for Moesif metrics.
  if (loadingMoesifConfig) {
    return (
      <PageContent sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
        <CircularProgress />
      </PageContent>
    );
  }

  // Not configured: default to the configure instructions. Persists the
  // Collector Application ID against the integration on save.
  if (!configured) {
    return (
      <PageContent>
        {header}
        <MoesifRuntimeConfigCard saving={configureMoesif.isPending} error={configureMoesif.error} onSave={(appId) => configureMoesif.mutate({ componentId: targetComponentId, applicationId: appId })} />
      </PageContent>
    );
  }

  // Configured, but the user chose to update the stored Collector Application
  // ID. Pre-fills the (masked) existing ID; saving persists the new value and
  // returns to the previous view.
  if (editingAppId) {
    return (
      <PageContent>
        {header}
        <MoesifRuntimeConfigCard
          currentAppId={configuredAppId}
          saving={configureMoesif.isPending}
          error={configureMoesif.error}
          onCancel={() => setEditingAppId(false)}
          onSave={(appId) => configureMoesif.mutate({ componentId: targetComponentId, applicationId: appId }, { onSuccess: () => setEditingAppId(false) })}
        />
      </PageContent>
    );
  }

  // Configured but the dashboard isn't linked yet: offer the "set up / link
  // dashboard" step. The user imports the template into Moesif and makes its
  // workspace public; the entered Management API Key is then sent to the backend,
  // which discovers the imported workspace id and persists it (setting the
  // `dashboardsCreated` flag). On success the config query is invalidated and the
  // metrics view below is shown.
  if (!dashboardsCreated) {
    return (
      <PageContent>
        {header}
        <MoesifDashboardCard
          applicationId={configuredAppId}
          creating={createDashboards.isPending}
          error={createDashboards.error}
          onCreate={(token, moesifAppId) => createDashboards.mutate({ componentId: targetComponentId, managementApiKey: token, moesifAppId })}
          onEditAppId={() => setEditingAppId(true)}
        />
      </PageContent>
    );
  }

  // Configured and linked, but the user chose to update the stored Management API
  // Key + Moesif Application ID. Re-links the dashboard via the backend discovery
  // flow (overwriting the stored credentials and workspace id) and, on success,
  // returns to the metrics view with a freshly-minted embed token.
  if (editingDashboard) {
    return (
      <PageContent>
        {header}
        <MoesifDashboardCard
          applicationId={configuredAppId}
          isEdit
          creating={createDashboards.isPending}
          error={createDashboards.error}
          onCancel={() => setEditingDashboard(false)}
          onCreate={(token, moesifAppId) => createDashboards.mutate({ componentId: targetComponentId, managementApiKey: token, moesifAppId }, { onSuccess: () => setEditingDashboard(false) })}
        />
      </PageContent>
    );
  }

  return (
    <PageContent>
      {header}

      {!isComponent && biComponents.length > 0 && (
        <Stack direction="row" gap={2} sx={{ mb: 3 }} flexWrap="wrap" alignItems="center">
          <Select value={integrationFilter} onChange={(e) => setIntegrationFilter(e.target.value as string)} size="small" sx={{ minWidth: 160 }} inputProps={{ 'aria-label': 'Integration' }}>
            <MenuItem value="all">Select an integration…</MenuItem>
            {biComponents.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.displayName}
              </MenuItem>
            ))}
          </Select>
          <Stack direction="row" gap={1} sx={{ ml: 'auto' }}>
            <Button variant="outlined" size="small" onClick={() => setEditingAppId(true)}>
              Edit Application ID
            </Button>
            <Button variant="outlined" size="small" onClick={() => setEditingDashboard(true)}>
              Edit dashboard credentials
            </Button>
          </Stack>
        </Stack>
      )}
      {isComponent && (
        <Stack direction="row" gap={1} sx={{ mb: 3 }} justifyContent="flex-end">
          <Button variant="outlined" size="small" onClick={() => setEditingAppId(true)}>
            Edit Application ID
          </Button>
          <Button variant="outlined" size="small" onClick={() => setEditingDashboard(true)}>
            Edit dashboard credentials
          </Button>
        </Stack>
      )}

      {loadingEmbed ? (
        <CircularProgress size={28} sx={{ display: 'block', mx: 'auto', my: 6 }} />
      ) : embedError ? (
        <Stack alignItems="center" gap={2} sx={{ py: 6 }}>
          <Alert
            severity="error"
            sx={{ width: '100%', maxWidth: 720 }}
            action={
              <Button color="inherit" size="small" onClick={() => refetchEmbed()} disabled={fetchingEmbed}>
                Retry
              </Button>
            }>
            {(embedError as Error).message || 'Failed to load the Moesif metrics dashboard.'}
          </Alert>
        </Stack>
      ) : embed ? (
        <iframe
          key={embed.accessToken}
          title="Moesif metrics dashboard"
          src={embed.embedUrl}
          // The embed URL points at the third-party Moesif dashboard and carries
          // a short-lived token, so constrain what the framed content can do:
          // deny top-level navigation and don't leak the tokenized URL via the
          // Referer header.
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          referrerPolicy="no-referrer"
          style={{ width: '100%', height: 'calc(100vh - 220px)', minHeight: 600, border: 'none' }}
        />
      ) : (
        <CircularProgress size={28} sx={{ display: 'block', mx: 'auto', my: 6 }} />
      )}
    </PageContent>
  );
}
