// Copyright (c) 2025, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
//
// WSO2 Inc. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
//  http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

import icp_server.storage as storage;
import icp_server.types as types;

import ballerina/http;
import ballerina/jwt;
import ballerina/log;

// HTTP service configuration
listener http:Listener httpListener = new (serverPort,
    config = {
        host: serverHost,
        secureSocket: {
            key: {
                path: keystorePath,
                password: resolvedKeystorePassword
            }
        }
    }
);

// Runtime management service
// Per-environment JWT validation: the @http:ServiceConfig auth block is intentionally
// removed so that each heartbeat request can be validated against its own environment's
// HMAC secret (stored in the database). validateRuntimeJwt() is called explicitly at
// the start of every resource function.
service /icp on httpListener {

    function init() {
        log:printInfo("Runtime service started at " + serverHost + ":" + serverPort.toString());
    }

    // Process heartbeat from runtime (M2: kid-based JWT validation + lazy binding)
    isolated resource function post heartbeat(http:Request request, @http:Payload json heartbeatJson)
            returns types:HeartbeatResponse|http:Unauthorized|http:BadRequest|http:Conflict|error? {
        do {
            types:Heartbeat heartbeat = check heartbeatJson.cloneWithType(types:Heartbeat);

            // --- Extract kid and validate JWT ---
            string|error jwtToken = extractBearerToken(request);
            if jwtToken is error {
                log:printWarn(string `Heartbeat rejected — missing bearer token for runtime: ${heartbeat.runtime}`);
                return <http:Unauthorized>{body: "Missing or malformed Authorization header"};
            }

            string kid = check extractKidFromJwt(jwtToken);
            log:printDebug(string `Heartbeat from runtime=${heartbeat.runtime}, kid=${kid}`);

            types:OrgSecret orgSecret = check storage:lookupOrgSecretByKeyId(kid);
            http:Unauthorized? authResult = validateRuntimeJwtWithSecret(jwtToken, orgSecret.keyMaterial);
            if authResult is http:Unauthorized {
                log:printWarn(string `Heartbeat rejected — invalid JWT for runtime: ${heartbeat.runtime}, kid=${kid}`);
                return authResult;
            }

            // --- Resolve environment and verify it matches the key's environment ---
            string environmentId = check storage:getEnvironmentIdByName(heartbeat.environment);
            if environmentId != orgSecret.environmentId {
                log:printWarn(string `Heartbeat rejected — environment mismatch for kid=${kid}: heartbeat=${environmentId}, key=${orgSecret.environmentId}`);
                return <http:Conflict>{body: string `Environment mismatch: key ID '${kid}' is bound to a different environment`};
            }

            // --- Bind or verify project+component ---
            string projectId;
            string componentId;

            if orgSecret.componentId is () {
                // Unbound key — resolve/auto-create project and component, then bind
                string? rawCreatedBy = orgSecret.createdBy;
                if rawCreatedBy is () || rawCreatedBy.trim().length() == 0 {
                    log:printWarn(string `Heartbeat rejected — cannot auto-provision for kid=${kid}: orgSecret has no createdBy`);
                    return <http:BadRequest>{body: string `Key '${kid}' has no creator on record; cannot auto-provision project/component`};
                }
                string createdBy = rawCreatedBy;
                projectId = check storage:resolveOrCreateProject(heartbeat.project, createdBy);
                componentId = check storage:resolveOrCreateComponent(projectId, heartbeat.component, heartbeat.runtimeType, createdBy);
                check storage:bindOrgSecret(kid, projectId, componentId, heartbeat.project, heartbeat.component, heartbeat.runtimeType);
                log:printInfo(string `Bound kid=${kid} to project=${projectId}, component=${componentId}, runtimeType=${heartbeat.runtimeType}`);
            } else {
                // Bound key — use stored IDs, enforce runtime type, log-only name mismatch
                if orgSecret.runtimeType is string && orgSecret.runtimeType != heartbeat.runtimeType {
                    log:printWarn(string `Heartbeat rejected — runtime type mismatch for kid=${kid}: bound=${orgSecret.runtimeType ?: "?"}, got=${heartbeat.runtimeType}`);
                    return <http:Conflict>{body: string `Runtime type mismatch: key ID '${kid}' is bound to ${orgSecret.runtimeType ?: "?"}, not ${heartbeat.runtimeType}`};
                }

                projectId = <string>orgSecret.projectId;
                componentId = <string>orgSecret.componentId;

                if orgSecret.projectHandler != heartbeat.project || orgSecret.componentName != heartbeat.component {
                    log:printError(string `Binding name mismatch for kid=${kid}: ` +
                        string `bound project=${orgSecret.projectHandler ?: "?"}/component=${orgSecret.componentName ?: "?"}, ` +
                        string `got project=${heartbeat.project}/component=${heartbeat.component}. ` +
                        string `Proceeding with bound IDs project=${projectId}, component=${componentId}`);
                }
            }

            // --- Prepare heartbeat fields as UUIDs for downstream processing ---
            heartbeat.environment = environmentId;
            heartbeat.project = projectId;
            heartbeat.component = componentId;

            types:HeartbeatResponse heartbeatResponse = check storage:processHeartbeat(heartbeat, preResolved = true);

            // Record this key ID on the runtime row (after upsert ensures the row exists).
            // Failure here is non-fatal — the heartbeat was already processed successfully.
            error? keyIdErr = storage:updateRuntimeKeyId(heartbeat.runtime, kid);
            if keyIdErr is error {
                log:printError(string `Failed to record keyId=${kid} on runtime=${heartbeat.runtime}`, 'error = keyIdErr);
            }
            log:printInfo(string `Heartbeat processed for runtime=${heartbeat.runtime}, kid=${kid}`);
            return heartbeatResponse;

        } on fail error e {
            log:printError("Failed to process heartbeat", e);
            return <types:HeartbeatResponse>{
                acknowledged: false,
                commands: [],
                errors: [e.message()]
            };
        }
    }

    // Process delta heartbeat from runtime
    isolated resource function post deltaHeartbeat(http:Request request, @http:Payload types:DeltaHeartbeat deltaHeartbeat)
            returns types:HeartbeatResponse|http:Unauthorized|error? {
        do {
            // Resolve the HMAC secret via runtime ID (environment is not in the delta payload)
            // and validate the bearer JWT before processing.
            string jwtSecret = check storage:resolveRuntimeJwtSecretByRuntimeId(deltaHeartbeat.runtime);
            http:Unauthorized? authResult = validateRuntimeJwt(request, jwtSecret);
            if authResult is http:Unauthorized {
                log:printWarn(string `Delta heartbeat rejected — invalid JWT for runtime: ${deltaHeartbeat.runtime}`);
                return authResult;
            }

            // Process delta heartbeat using the repository
            types:HeartbeatResponse heartbeatResponse = check storage:processDeltaHeartbeat(deltaHeartbeat);
            log:printInfo(string `Delta heartbeat processed successfully for ${deltaHeartbeat.runtime}`);
            return heartbeatResponse;

        } on fail error e {
            // Return error response
            log:printError("Failed to process delta heartbeat", e);
            types:HeartbeatResponse errorResponse = {
                acknowledged: false,
                fullHeartbeatRequired: true,
                commands: []
            };
            return errorResponse;
        }
    }

}

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------

isolated function extractBearerToken(http:Request request) returns string|error {
    string authHeader = check request.getHeader("Authorization");
    if !authHeader.startsWith("Bearer ") {
        return error("Malformed Authorization header");
    }
    return authHeader.substring(7);
}

isolated function extractKidFromJwt(string jwtToken) returns string|error {
    [jwt:Header, jwt:Payload]|jwt:Error decoded = jwt:decode(jwtToken);
    if decoded is jwt:Error {
        log:printDebug(string `JWT decode failed: ${decoded.message()}`);
        return error("Malformed JWT — cannot decode header", decoded);
    }
    jwt:Header jwtHeader = decoded[0];
    string? kid = jwtHeader.kid;
    if kid is () {
        return error("JWT header missing 'kid' claim");
    }
    log:printDebug(string `Extracted kid=${kid} from JWT header`);
    return kid;
}

isolated function validateRuntimeJwtWithSecret(string jwtToken, string hmacSecret) returns http:Unauthorized? {
    jwt:ValidatorConfig validatorConfig = {
        issuer: jwtIssuer,
        audience: jwtAudience,
        clockSkew: jwtClockSkewSeconds,
        signatureConfig: {secret: hmacSecret}
    };

    jwt:Payload|jwt:Error validatedPayload = jwt:validate(jwtToken, validatorConfig);
    if validatedPayload is jwt:Error {
        log:printDebug(string `JWT validation failed: ${validatedPayload.message()}`);
        return <http:Unauthorized>{body: "Invalid or expired token"};
    }

    anydata scope = validatedPayload["scope"];
    if !(scope is string && scope == "runtime_agent") {
        return <http:Unauthorized>{body: "Insufficient scope — 'runtime_agent' required"};
    }

    return ();
}

// Legacy validator used by delta heartbeat (extracts token from request + validates)
isolated function validateRuntimeJwt(http:Request request, string hmacSecret) returns http:Unauthorized? {
    string|error token = extractBearerToken(request);
    if token is error {
        return <http:Unauthorized>{body: "Missing or malformed Authorization header"};
    }
    return validateRuntimeJwtWithSecret(token, hmacSecret);
}

