// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

import icp_server.auth;
import icp_server.storage;
import icp_server.types;

import ballerina/http;
import ballerina/log;

// ── Workflow management proxy ────────────────────────────────────────────────
// Forwards frontend calls to the per-runtime workflow management REST service
// (base path `/workflow` on the runtime side). The reachable base URL is the
// `callbackUrl` reported in the heartbeat and stored on the `runtimes` row.
//
// Frontend → GET/POST https://<icp>/icp/workflow/{componentId}/{environmentId}/<wf-path>
//          → forwarded to <callbackUrl>/workflow/<wf-path>
//
// The proxy injects `x-user-id` and `x-user-roles` (the caller's ICP permission
// scopes, plus a synthetic `admin` role for super-admins) so the workflow
// service can do its own human-task authorization.

// Allow self-signed certs when the callbackUrl is https (suitable for
// K8s-internal / dev). Set to false in production with a trusted chain.
configurable boolean workflowProxyAllowInsecureTLS = true;

// Request timeout (seconds) for calls to the runtime workflow service.
configurable decimal workflowProxyTimeout = 30;

// Cache of http:Clients keyed by callbackUrl so we don't rebuild a client per request.
isolated map<http:Client> workflowClientCache = {};

isolated function getWorkflowClient(string baseUrl) returns http:Client|error {
    lock {
        if workflowClientCache.hasKey(baseUrl) {
            return workflowClientCache.get(baseUrl);
        }
    }
    http:ClientConfiguration cfg = {timeout: workflowProxyTimeout};
    if baseUrl.startsWith("https") && workflowProxyAllowInsecureTLS {
        cfg.secureSocket = {enable: false};
    }
    http:Client newClient = check new (baseUrl, cfg);
    lock {
        // Re-check in case another worker created it meanwhile.
        if workflowClientCache.hasKey(baseUrl) {
            return workflowClientCache.get(baseUrl);
        }
        workflowClientCache[baseUrl] = newClient;
    }
    return newClient;
}

// Fetches workflow definitions live from the runtime's GET /workflow/definitions API for the
// given component+environment and maps them to the Workflow artifact shape used by the frontend.
// Returns [] when no running runtime advertises a workflow callback URL. Used by the GraphQL
// `workflowsByEnvironmentAndComponent` resolver (definitions are no longer carried in heartbeats).
isolated function fetchWorkflowDefinitions(string componentId, string environmentId) returns types:Workflow[]|error {
    string?|error callbackUrl = storage:getRuntimeCallbackUrl(componentId, environmentId);
    if callbackUrl is error {
        return callbackUrl;
    }
    if callbackUrl is () {
        return [];
    }

    http:Client wfClient = check getWorkflowClient(callbackUrl);
    http:Response resp = check wfClient->get("/workflow/definitions");
    if resp.statusCode != 200 {
        json|error errBody = resp.getJsonPayload();
        return error("Workflow definitions request failed: " + (errBody is json ? errBody.toString() : "status " + resp.statusCode.toString()));
    }
    json payload = check resp.getJsonPayload();
    json definitionsJson = check payload.definitions;
    types:WorkflowDefinition[] defs = check definitionsJson.cloneWithType();

    // Definitions are shared across the component+environment's runtimes; attach them for the UI.
    types:Runtime[] runtimes = check storage:getRuntimes((), (), environmentId, (), componentId);
    string[] runtimeIds = from var r in runtimes
        select r.runtimeId;
    types:ArtifactRuntimeInfo[] runtimeInfos = from var r in runtimes
        select {runtimeId: r.runtimeId, runtimeName: r?.runtimeName, status: r.status};

    types:Workflow[] result = [];
    foreach types:WorkflowDefinition d in defs {
        boolean active = d.isActive ?: false;
        result.push({
            name: d.workflowType,
            isActive: active,
            workerCount: d.workerCount ?: 0,
            inputSchema: d?.inputSchema,
            state: active ? types:ENABLED : types:DISABLED,
            runtimeIds: runtimeIds,
            runtimes: runtimeInfos
        });
    }
    return result;
}

isolated function workflowErrorResponse(int statusCode, string message) returns http:Response {
    http:Response res = new;
    res.statusCode = statusCode;
    res.setJsonPayload({"error": {"message": message}});
    return res;
}

// Performs auth, runtime resolution, header injection and forwarding for one
// workflow management request; returns the response to relay to the caller.
function proxyWorkflowRequest(string componentId, string environmentId, string[] wfPath, http:Request req) returns http:Response {
    // 1. Identify the caller from the (already JWT-validated) Authorization header.
    string|http:HeaderNotFoundError authHeader = req.getHeader("Authorization");
    if authHeader is http:HeaderNotFoundError {
        return workflowErrorResponse(401, "Authorization header missing");
    }
    types:UserContextV2|error userContext = auth:extractUserContextV2(authHeader);
    if userContext is error {
        return workflowErrorResponse(401, "Invalid token: " + userContext.message());
    }

    // 2. Authorize against the integration scope. Reads need VIEW; human-task /
    //    retry-task actions need EDIT; workflow lifecycle/start needs MANAGE.
    string|error projectId = storage:getProjectIdByComponentId(componentId);
    if projectId is error {
        return workflowErrorResponse(404, "Component not found: " + componentId);
    }
    types:AccessScope scope = {
        orgUuid: 1,
        projectUuid: projectId,
        integrationUuid: componentId,
        envUuid: environmentId
    };
    string method = req.method;
    string firstSeg = wfPath.length() > 0 ? wfPath[0] : "";
    string[] allowedPermissions;
    if method == http:GET {
        allowedPermissions = [auth:PERMISSION_INTEGRATION_VIEW, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE];
    } else if firstSeg == "human-tasks" || firstSeg == "retry-tasks" {
        allowedPermissions = [auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE];
    } else {
        allowedPermissions = [auth:PERMISSION_INTEGRATION_MANAGE];
    }
    boolean|error permitted = auth:hasAnyPermission(userContext.userId, allowedPermissions, scope);
    if permitted is error {
        return workflowErrorResponse(500, "Authorization check failed: " + permitted.message());
    }
    if !permitted {
        log:printWarn("Workflow proxy access denied", userId = userContext.userId, componentId = componentId, method = method);
        return workflowErrorResponse(403, "Access denied");
    }

    // 3. Resolve the runtime workflow service base URL.
    string?|error callbackUrl = storage:getRuntimeCallbackUrl(componentId, environmentId);
    if callbackUrl is error {
        return workflowErrorResponse(500, "Failed to resolve workflow runtime: " + callbackUrl.message());
    }
    if callbackUrl is () {
        return workflowErrorResponse(503, "No running workflow runtime with a callback URL for this environment");
    }

    // 4. Build the target path (preserve the original query string verbatim).
    string subPath = string:'join("/", ...wfPath);
    string rawPath = req.rawPath;
    int? qIdx = rawPath.indexOf("?");
    string query = qIdx is int ? rawPath.substring(qIdx) : "";
    string targetPath = "/workflow/" + subPath + query;

    // 5. Inject identity headers; drop ICP's bearer token (not used upstream).
    string roles = string:'join(",", ...userContext.permissions);
    boolean|error superAdmin = auth:isSuperAdmin(userContext.userId);
    if superAdmin is boolean && superAdmin {
        roles = roles.length() > 0 ? roles + ",admin" : "admin";
    }
    req.setHeader("x-user-id", userContext.userId);
    req.setHeader("x-user-roles", roles);
    req.removeHeader("Authorization");

    // 6. Forward (method + body preserved) and relay the upstream response.
    http:Client|error wfClient = getWorkflowClient(callbackUrl);
    if wfClient is error {
        return workflowErrorResponse(502, "Failed to connect to workflow runtime: " + wfClient.message());
    }
    http:Response|error upstream = wfClient->forward(targetPath, req);
    if upstream is error {
        log:printError("Workflow proxy forward failed", upstream, targetPath = targetPath);
        return workflowErrorResponse(502, "Workflow runtime request failed: " + upstream.message());
    }
    return upstream;
}

@http:ServiceConfig {
    auth: [
        {
            jwtValidatorConfig: {
                issuer: frontendJwtIssuer,
                audience: frontendJwtAudience,
                signatureConfig: {
                    secret: resolvedFrontendJwtHMACSecret
                }
            }
        }
    ],
    cors: {
        allowOrigins: ["*"],
        allowHeaders: ["Content-Type", "Authorization"]
    }
}
service /icp/workflow on httpListener {

    function init() {
        log:printInfo("Workflow management proxy started at " + serverHost + ":" + serverPort.toString());
    }

    // Catch-all forwarders. {componentId}/{environmentId} pin the target runtime;
    // the remaining segments + query are forwarded verbatim to <callbackUrl>/workflow/...
    // Explicit get/post accessors (not 'default) so CORS preflight OPTIONS is
    // auto-handled by the listener and not subjected to service auth. The workflow
    // management API only uses GET and POST.
    resource function get [string componentId]/[string environmentId]/[string... wfPath](http:Caller caller, http:Request req) returns error? {
        check caller->respond(proxyWorkflowRequest(componentId, environmentId, wfPath, req));
    }

    resource function post [string componentId]/[string environmentId]/[string... wfPath](http:Caller caller, http:Request req) returns error? {
        check caller->respond(proxyWorkflowRequest(componentId, environmentId, wfPath, req));
    }
}
