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

/**
 * The `main.bal` imports a BI runtime needs. The ICP bridge is always required; workflow management
 * additionally needs its own module imported, because the `[ballerina.workflow.management]`
 * configuration only takes effect when the module is part of the build. Ordered the way `bal format`
 * sorts imports (by org, then module). Shared by the Add Runtime dialogs.
 */
export function runtimeImports(workflowMgt: boolean): string {
  const bridge = 'import wso2/icp.runtime.bridge as _;';
  return workflowMgt ? `import ballerina/workflow.management as _;\n\n${bridge}` : bridge;
}

/**
 * TOML the "Enable Workflow Management" toggle adds to a BI runtime: the workflow engine block,
 * then the management API block keyed by the org secret. `project` becomes the workflow namespace
 * and should be whatever the `project` key of the bridge config above it holds, so the two agree —
 * the real project handle on the component runtime page, the fill-in placeholder on the org page.
 * Shared by the Add Runtime dialogs (org runtimes and component runtime pages).
 */
export function workflowManagementToml(project: string, secret: string): string {
  return `[ballerina.workflow]
# mode = "LOCAL"
namespace = "${project}"

[ballerina.workflow.management]
enableManagementApi = true
enableApiKey = true
apiKeyValue = "${secret}"
apiKeyHeader = "X-API-Key"
enableBasicAuth = false`;
}
