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
import { ToggleButton, ToggleButtonGroup } from '@wso2/oxygen-ui';
import { useEffect, useState, type JSX } from 'react';
import { hasComponent, type ProjectScope, type ComponentScope } from '../nav';
import { useProjectByHandler, useComponentByHandler } from '../api/queries';
import MetricsOpenSearch from './MetricsOpenSearch';
import MetricsMoesif from './MetricsMoesif';

type MetricsBackend = 'opensearch' | 'moesif';

/**
 * Metrics dispatcher.
 *
 * Lets the user choose the runtime metrics backend (OpenSearch or Moesif) via
 * an on-page toggle and renders the corresponding runtime metrics page. The
 * toggle control is passed down so each page renders it consistently in its
 * header row.
 *
 * Moesif metrics are currently only offered for BI runtimes. At component scope
 * the Moesif backend is only exposed when the component's technology is BI; at
 * project scope the toggle stays available and the Moesif page filters its
 * integration picker to BI integrations.
 */
export default function Metrics(scope: ProjectScope | ComponentScope): JSX.Element {
  const [backend, setBackend] = useState<MetricsBackend>('opensearch');

  const isComponent = hasComponent(scope);
  const { data: project } = useProjectByHandler(scope.project);
  const { data: component } = useComponentByHandler(project?.id ?? '', isComponent ? scope.component : undefined);
  const moesifAllowed = isComponent ? component?.componentType === 'BI' : true;

  // If Moesif was selected but isn't allowed for this component (non-BI), fall
  // back to the OpenSearch backend.
  useEffect(() => {
    if (!moesifAllowed && backend === 'moesif') setBackend('opensearch');
  }, [moesifAllowed, backend]);

  const backendSelector = moesifAllowed ? (
    <ToggleButtonGroup
      value={backend}
      exclusive
      size="small"
      onChange={(_e, value: MetricsBackend | null) => {
        if (value) setBackend(value);
      }}
      aria-label="Metrics backend">
      <ToggleButton value="opensearch" aria-label="OpenSearch metrics">
        OpenSearch
      </ToggleButton>
      <ToggleButton value="moesif" aria-label="Moesif metrics">
        Moesif
      </ToggleButton>
    </ToggleButtonGroup>
  ) : undefined;

  return backend === 'moesif' && moesifAllowed ? <MetricsMoesif scope={scope} backendSelector={backendSelector} /> : <MetricsOpenSearch scope={scope} backendSelector={backendSelector} />;
}
