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

// Moesif dashboards import template for the ICP runtime metrics chart. The user
// downloads this and imports it into Moesif (Dashboards → Import), which creates
// the "Application Metrics" dashboard and its "Response time metrics" workspace.
// The workspace must then be set to Public sharing so the backend can mint embed
// access tokens for it. Kept as a plain object (rather than an imported .json) so
// the download filename and formatting are fully controlled here.
export const MOESIF_METRICS_TEMPLATE = {
  dashboards: [
    {
      _id: '68c3a8c60da2e0712e09a152',
      name: 'Application Metrics',
      dashboard_ids: [],
      workspace_ids: [['68c3aaa00da2e0712e09a163']],
      parent: null,
    },
  ],
  workspaces: [
    {
      _id: '68c3aaa00da2e0712e09a163',
      type: 'events',
      name: 'Response time metrics',
      args: '',
      es_query: {
        post_filter: {
          terms: {
            'event_type.raw': ['user_action'],
          },
        },
        size: 50,
        _source: [
          'id',
          '_id',
          'org_id',
          'app_id',
          'user_id',
          'user.created',
          'company_id',
          'company.created',
          'anonymous_id',
          'identified_user_id',
          'event_type',
          'action_name',
          'weight',
          'direction',
          'duration_ms',
          'request.time',
          'request.uri',
          'request.route',
          'request.verb',
          'request.ip_address',
          'request.user_agent.name',
          'response.status',
          'response.time',
          'insights.anomaly',
          'insights.event_anomaly',
          'request.graphql.operation_name',
          'request.graphql.definitions',
          'jsonrpc.request.method',
          'jsonrpc.request.params.call__method',
          'jsonrpc.response.error',
          'vtype_ids',
          'blocked_by',
          'span.id',
          'span.status',
          'span.parent_id',
          'trace_id',
          'log.severity',
          'resource',
          'metadata.timestamp',
          'metadata.metric_type',
          'metadata.metric_name',
          'metadata.metric_value',
        ],
        sort: [
          {
            'request.time': {
              order: 'desc',
              unmapped_type: 'long',
            },
          },
        ],
      },
      dateRange: {
        from: '-7d',
        to: 'now',
      },
      view: 'events',
      funnel_query: {},
      urlQuery:
        '?evtcf[filtersGroups][0][filters][0][field]=event_type.raw&evtcf[filtersGroups][0][filters][0][op]=contains&evtcf[filtersGroups][0][filters][0][value][0]=user_action&shown_fields[0]=metadata.timestamp&shown_fields[1]=metadata.metric_type&shown_fields[2]=metadata.metric_name&shown_fields[3]=metadata.metric_value',
    },
  ],
} as const;

// Suggested filename when the user downloads the template.
export const MOESIF_METRICS_TEMPLATE_FILENAME = 'moesif_metrics_dashboard_template.json';

// The name of the workspace created by importing the template. Shown in the UI
// instructions (the user must set this workspace's sharing to Public) and used
// by the backend to discover the workspace id.
export const MOESIF_METRICS_WORKSPACE_NAME = 'Response time metrics';

// Triggers a browser download of the template as a formatted JSON file.
export function downloadMoesifMetricsTemplate(): void {
  const blob = new Blob([JSON.stringify(MOESIF_METRICS_TEMPLATE, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = MOESIF_METRICS_TEMPLATE_FILENAME;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
