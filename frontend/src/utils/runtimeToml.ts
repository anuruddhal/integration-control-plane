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

// The escapes TOML defines for a basic (double-quoted) string.
const TOML_ESCAPES: Record<string, string> = { '\\': '\\\\', '"': '\\"', '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f' };

/**
 * Escapes a value for interpolation into a double-quoted TOML string. Handlers are free text — the
 * create forms only require "at least one letter or number" — so a name containing a quote would
 * otherwise close the string early and yield a config that fails to parse once pasted. Done in one
 * pass so an escaped backslash is not re-escaped.
 */
function tomlString(value: string): string {
  return value.replace(/[\\"\n\r\t\b\f]/g, (c) => TOML_ESCAPES[c]);
}

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
 * then the management API block keyed by the org secret. `project` and `integration` become the
 * workflow namespace and task queue, and should each be whatever the matching key of the bridge
 * config above holds, so the values always agree — the real handles on the component runtime page,
 * the same fill-in placeholders on the org page, which has no project or integration to resolve.
 * Shared by the Add Runtime dialogs (org runtimes and component runtime pages).
 */
export function workflowManagementToml(project: string, integration: string, secret: string): string {
  return `[ballerina.workflow]
# mode = "LOCAL"
namespace = "${tomlString(project)}"
taskQueue = "${tomlString(integration)}"

[ballerina.workflow.management]
enableManagementApi = true
enableApiKey = true
apiKeyValue = "${tomlString(secret)}"
apiKeyHeader = "X-API-Key"
enableBasicAuth = false`;
}
