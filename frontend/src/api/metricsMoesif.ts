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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { gql } from './graphql';

// ── Moesif metrics configuration (per project + integration) ──

// Whether an integration (project + component combo) has been configured for
// Moesif metrics (a Collector Application ID stored against it) and whether its
// metrics workspace/dashboard has been created in Moesif.
export interface MoesifMetricsConfigStatus {
  configured: boolean;
  applicationId?: string | null;
  dashboardsCreated: boolean;
}

const MOESIF_METRICS_CONFIG_QUERY = `
  query MoesifMetricsConfig($componentId: String!) {
    moesifMetricsConfig(componentId: $componentId) {
      configured, applicationId, dashboardsCreated
    }
  }`;

// Reads whether the given integration is configured for Moesif metrics.
export function useMoesifMetricsConfig(componentId: string | undefined) {
  return useQuery<MoesifMetricsConfigStatus>({
    queryKey: ['moesif-metrics-config', componentId],
    queryFn: () => gql<{ moesifMetricsConfig: MoesifMetricsConfigStatus }>(MOESIF_METRICS_CONFIG_QUERY, { componentId }).then((d) => d.moesifMetricsConfig),
    enabled: !!componentId,
    staleTime: 0,
  });
}

const CONFIGURE_MOESIF_METRICS_MUTATION = `
  mutation ConfigureMoesifMetrics($componentId: String!, $applicationId: String!) {
    configureMoesifMetrics(componentId: $componentId, applicationId: $applicationId) {
      configured, applicationId
    }
  }`;

// Persists the Moesif Collector Application ID against the integration, marking
// it as configured for Moesif metrics.
export function useConfigureMoesifMetrics() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { componentId: string; applicationId: string }) => gql<{ configureMoesifMetrics: MoesifMetricsConfigStatus }>(CONFIGURE_MOESIF_METRICS_MUTATION, input).then((d) => d.configureMoesifMetrics),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['moesif-metrics-config', variables.componentId] });
    },
  });
}

const CREATE_MOESIF_DASHBOARDS_MUTATION = `
  mutation CreateMoesifDashboards($componentId: String!, $managementApiKey: String!, $moesifAppId: String!) {
    createMoesifDashboards(componentId: $componentId, managementApiKey: $managementApiKey, moesifAppId: $moesifAppId) {
      configured, applicationId, dashboardsCreated
    }
  }`;

// Requests the backend to create the Moesif metrics workspace + dashboard using
// the supplied Management API token and Moesif Application ID. On success the
// integration's `dashboardsCreated` flag is persisted.
export function useCreateMoesifDashboards() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { componentId: string; managementApiKey: string; moesifAppId: string }) => gql<{ createMoesifDashboards: MoesifMetricsConfigStatus }>(CREATE_MOESIF_DASHBOARDS_MUTATION, input).then((d) => d.createMoesifDashboards),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['moesif-metrics-config', variables.componentId] });
      qc.invalidateQueries({ queryKey: ['moesif-dashboard-embed', variables.componentId] });
    },
  });
}

// ── Moesif dashboard embed (short-lived workspace access token + iframe src) ──

// A short-lived descriptor used to embed the Moesif metrics dashboard in an
// iframe. `embedUrl` is the fully-formed iframe src; the underlying access token
// is valid for ~1 hour, so the query is refetched before it expires.
export interface MoesifDashboardEmbed {
  workspaceId: string;
  accessToken: string;
  embedUrl: string;
}

const MOESIF_DASHBOARD_EMBED_QUERY = `
  query MoesifDashboardEmbed($componentId: String!) {
    moesifDashboardEmbed(componentId: $componentId) {
      workspaceId, accessToken, embedUrl
    }
  }`;

// Access token TTL is 1 hour on the backend; refetch a few minutes early so the
// embedded iframe never loads with an expired token.
const MOESIF_EMBED_REFETCH_MS = 55 * 60 * 1000; // 55 minutes

// Mints a short-lived Moesif workspace access token (via the backend) and
// returns the embed URL for the integration's metrics dashboard. Only enabled
// once the dashboards have been created for the integration.
export function useMoesifDashboardEmbed(componentId: string | undefined, enabled: boolean) {
  return useQuery<MoesifDashboardEmbed>({
    queryKey: ['moesif-dashboard-embed', componentId],
    queryFn: () => gql<{ moesifDashboardEmbed: MoesifDashboardEmbed }>(MOESIF_DASHBOARD_EMBED_QUERY, { componentId }).then((d) => d.moesifDashboardEmbed),
    enabled: !!componentId && enabled,
    staleTime: MOESIF_EMBED_REFETCH_MS,
    refetchInterval: MOESIF_EMBED_REFETCH_MS,
    refetchIntervalInBackground: false,
    retry: false,
  });
}
