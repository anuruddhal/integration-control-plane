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

import { Alert, Box, CircularProgress, Stack } from '@wso2/oxygen-ui';
import { useMemo, type JSX } from 'react';
import TailscaleComponentInfo from './TailscaleComponentInfo';
import TailscaleEnvCard from './TailscaleEnvCard';
import type { ComponentDetail } from '../../../types/component';
import type { Environment } from '../../../types/environment';

interface TailscaleOverviewProps {
  orgHandler: string;
  projectId: string;
  component: ComponentDetail;
  environments: Environment[];
  canManage: boolean;
}

/**
 * The Tailscale proxy surface: an identity header followed by one configuration
 * card per environment. Shared by the component Overview (`CustomOverview`) and
 * the project Settings → VPN Configuration page.
 */
export default function TailscaleOverview({ orgHandler, projectId, component, environments, canManage }: TailscaleOverviewProps): JSX.Element {
  const versionId = useMemo(() => {
    const tracks = component.deploymentTracks ?? [];
    return tracks.find((t) => t.latest)?.id ?? tracks[0]?.id ?? '';
  }, [component.deploymentTracks]);

  return (
    <>
      <TailscaleComponentInfo component={component} />
      {!versionId ? (
        <Alert severity="info">This proxy has no deployment track yet.</Alert>
      ) : environments.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Stack>
          {environments.map((env) => (
            <TailscaleEnvCard key={env.id} orgHandler={orgHandler} projectId={projectId} component={{ id: component.id, handler: component.handler }} versionId={versionId} env={env} canManage={canManage} />
          ))}
        </Stack>
      )}
    </>
  );
}
