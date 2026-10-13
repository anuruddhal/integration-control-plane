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

import { choreoClient } from './httpClients';
import type {
  ConfigMapWriteData,
  ConfigMountPath,
  ConfigMountWriteData,
  ContainerWriteData,
  DevopsConfigMap,
  DevopsConfigMapDetails,
  DevopsConfigMount,
  DevopsSecret,
  DevopsSecretDetails,
  ReleaseContainer,
  ReleaseDetails,
  SecretWriteData,
} from '../../types/devopsConfigs';

// ConfigMaps, Secrets, and their container config-mounts live on the devops
// service (via choreoClient). REST calls take `organization_id` + `project_id`
// query params; responses wrap data in `{ data: ... }`. URLs mirror Devant.
const BASE = '/devops/1.0.0/api/v1';
type Wrapped<T> = { data: T };

/** `organization_id` + `project_id` query string. */
function dq(orgUuid: string, projectId: string): string {
  return new URLSearchParams({ organization_id: orgUuid, project_id: projectId }).toString();
}

// ── release (app-environment → containers) ────────────────────────────────────

export async function getReleaseById(orgUuid: string, projectId: string, componentId: string, releaseId: string): Promise<ReleaseDetails> {
  const res = await choreoClient.get<Wrapped<ReleaseDetails>>(`${BASE}/components/${encodeURIComponent(componentId)}/release/${encodeURIComponent(releaseId)}?${dq(orgUuid, projectId)}`);
  return res.data;
}

/** Update a release container's resources, image-pull policy, command/args and ports. */
export async function updateContainer(orgUuid: string, projectId: string, componentId: string, releaseId: string, containerId: string, data: ContainerWriteData): Promise<ReleaseContainer> {
  const res = await choreoClient.put<Wrapped<ReleaseContainer>>(`${BASE}/components/${encodeURIComponent(componentId)}/release/${encodeURIComponent(releaseId)}/container/${encodeURIComponent(containerId)}?${dq(orgUuid, projectId)}`, data);
  return res.data;
}

// ── secrets ───────────────────────────────────────────────────────────────────

export async function getSecrets(orgUuid: string, projectId: string, environmentId: string): Promise<DevopsSecret[]> {
  const res = await choreoClient.get<Wrapped<DevopsSecret[]>>(`${BASE}/environments/${encodeURIComponent(environmentId)}/secret?${dq(orgUuid, projectId)}`);
  return res.data;
}

export async function getSecretDetails(orgUuid: string, projectId: string, environmentId: string, secretId: string): Promise<DevopsSecretDetails> {
  const res = await choreoClient.get<Wrapped<DevopsSecretDetails>>(`${BASE}/environments/${encodeURIComponent(environmentId)}/secret/${encodeURIComponent(secretId)}?${dq(orgUuid, projectId)}`);
  return res.data;
}

export async function createSecret(orgUuid: string, projectId: string, data: SecretWriteData): Promise<DevopsSecret> {
  const res = await choreoClient.post<Wrapped<DevopsSecret>>(`${BASE}/environments/${encodeURIComponent(data.environment_id)}/secret?${dq(orgUuid, projectId)}`, data);
  return res.data;
}

export async function updateSecret(orgUuid: string, projectId: string, secretId: string, data: SecretWriteData): Promise<DevopsSecret> {
  const res = await choreoClient.put<Wrapped<DevopsSecret>>(`${BASE}/environments/${encodeURIComponent(data.environment_id)}/secret/${encodeURIComponent(secretId)}?${dq(orgUuid, projectId)}`, data);
  return res.data;
}

export async function deleteSecret(orgUuid: string, projectId: string, environmentId: string, secretId: string): Promise<void> {
  await choreoClient.delete<void>(`${BASE}/environments/${encodeURIComponent(environmentId)}/secret/${encodeURIComponent(secretId)}?${dq(orgUuid, projectId)}`);
}

// ── config maps ────────────────────────────────────────────────────────────────

export async function getConfigMaps(orgUuid: string, projectId: string, environmentId: string): Promise<DevopsConfigMap[]> {
  const res = await choreoClient.get<Wrapped<DevopsConfigMap[]>>(`${BASE}/environments/${encodeURIComponent(environmentId)}/configmap?${dq(orgUuid, projectId)}`);
  return res.data;
}

export async function getConfigMapDetails(orgUuid: string, projectId: string, environmentId: string, configMapId: string): Promise<DevopsConfigMapDetails> {
  const res = await choreoClient.get<Wrapped<DevopsConfigMapDetails>>(`${BASE}/environments/${encodeURIComponent(environmentId)}/configmap/${encodeURIComponent(configMapId)}?${dq(orgUuid, projectId)}`);
  return res.data;
}

export async function createConfigMap(orgUuid: string, projectId: string, data: ConfigMapWriteData): Promise<DevopsConfigMap> {
  const res = await choreoClient.post<Wrapped<DevopsConfigMap>>(`${BASE}/environments/${encodeURIComponent(data.environment_id)}/configmap?${dq(orgUuid, projectId)}`, data);
  return res.data;
}

export async function updateConfigMapData(orgUuid: string, projectId: string, configMapId: string, data: ConfigMapWriteData): Promise<DevopsConfigMapDetails> {
  const res = await choreoClient.put<Wrapped<DevopsConfigMapDetails>>(`${BASE}/environments/${encodeURIComponent(data.environment_id)}/configmap/${encodeURIComponent(configMapId)}?${dq(orgUuid, projectId)}`, data);
  return res.data;
}

export async function deleteConfigMap(orgUuid: string, projectId: string, environmentId: string, configMapId: string): Promise<void> {
  await choreoClient.delete<void>(`${BASE}/environments/${encodeURIComponent(environmentId)}/configmap/${encodeURIComponent(configMapId)}?${dq(orgUuid, projectId)}`);
}

// ── container config mounts ──────────────────────────────────────────────────

export async function getContainerConfigMounts(orgUuid: string, projectId: string, componentId: string, releaseId: string, containerId: string): Promise<DevopsConfigMount[]> {
  const res = await choreoClient.get<Wrapped<DevopsConfigMount[] | DevopsConfigMount>>(
    `${BASE}/components/${encodeURIComponent(componentId)}/release/${encodeURIComponent(releaseId)}/container/${encodeURIComponent(containerId)}/config-mount?${dq(orgUuid, projectId)}`,
  );
  const mounts = res.data;
  return Array.isArray(mounts) ? mounts : mounts ? [mounts] : [];
}

export async function mountConfig(orgUuid: string, projectId: string, componentId: string, data: ConfigMountWriteData): Promise<DevopsConfigMount> {
  const body = { mount_path: '', config_key: '', deploy_changes: true, ...data };
  const res = await choreoClient.post<Wrapped<DevopsConfigMount>>(
    `${BASE}/components/${encodeURIComponent(componentId)}/release/${encodeURIComponent(data.app_environment_id)}/container/${encodeURIComponent(data.container_id)}/config-mount?${dq(orgUuid, projectId)}`,
    body,
  );
  return res.data;
}

export async function updateConfigMount(orgUuid: string, projectId: string, path: ConfigMountPath, data: ConfigMountWriteData): Promise<DevopsConfigMount> {
  const res = await choreoClient.put<Wrapped<DevopsConfigMount>>(
    `${BASE}/components/${encodeURIComponent(path.componentId)}/release/${encodeURIComponent(path.releaseId)}/container/${encodeURIComponent(path.containerId)}/config-mount/${encodeURIComponent(path.mountId)}?${dq(orgUuid, projectId)}`,
    { ...data, deploy_changes: true },
  );
  return res.data;
}

export async function removeConfigMount(orgUuid: string, projectId: string, path: ConfigMountPath): Promise<void> {
  await choreoClient.delete<void>(
    `${BASE}/components/${encodeURIComponent(path.componentId)}/release/${encodeURIComponent(path.releaseId)}/container/${encodeURIComponent(path.containerId)}/config-mount/${encodeURIComponent(path.mountId)}?${dq(orgUuid, projectId)}`,
  );
}
