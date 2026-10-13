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

import { Box, CircularProgress } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import TailscaleOverview from './TailscaleOverview';
import { Permissions } from '../../../constants/permissions';
import { useAccessControl } from '../../../contexts/AccessControlContext';
import { useComponentByHandler } from '../../../hooks/useComponents';
import { useEnvironments } from '../../../hooks/useEnvironments';
import { useProjectId } from '../../../hooks/useProjects';
import { hasProject, useScope } from '../../../nav';
import type { OverviewHeaderSlotProps } from '../../../types/integration';

/**
 * Full-surface Overview for a Tailscale proxy — bypasses the env-card shell
 * (`CustomOverview`). Resolves its own scope/environments/detail via hooks since
 * the slot only receives `{ component, identity }`.
 */
export default function TailscaleCustomOverview({ component }: OverviewHeaderSlotProps): JSX.Element {
  const scope = useScope();
  const projectHandle = hasProject(scope) ? scope.project : '';
  const { projectId } = useProjectId(projectHandle);
  const { data: detail } = useComponentByHandler(projectId, component.handler);
  const { data: environments = [] } = useEnvironments(scope.org, projectId);
  const { hasAnyPermission } = useAccessControl();
  const canManage = hasAnyPermission([Permissions.INTEGRATION_MANAGE], projectId || undefined, component.id);

  if (!detail)
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );

  return <TailscaleOverview orgHandler={scope.org} projectId={projectId} component={detail} environments={environments} canManage={canManage} />;
}
