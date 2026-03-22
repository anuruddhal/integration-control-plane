// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
//
// WSO2 LLC. licenses this file to you under the Apache License,
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

import icp_server.types;

import ballerina/log;
import ballerina/sql;
import ballerina/uuid;

isolated function generateKeyId() returns string|error {
    // Try up to 5 times to produce a collision-free 8-char key ID.
    foreach int attempt in 0 ..< 5 {
        string candidate = uuid:createRandomUuid().substring(0, 8);
        log:printDebug(string `generateKeyId: attempt ${attempt}, candidate=${candidate}`);

        stream<record {|int cnt;|}, sql:Error?> s =
            dbClient->query(`SELECT COUNT(*) AS cnt FROM org_secrets WHERE key_id = ${candidate}`);
        record {|int cnt;|}[] rows = check from record {|int cnt;|} r in s select r;

        if rows[0].cnt == 0 {
            log:printDebug(string `generateKeyId: candidate=${candidate} is unique`);
            return candidate;
        }
        log:printDebug(string `generateKeyId: candidate=${candidate} collided, retrying`);
    }
    return error("Failed to generate a unique key ID after 5 attempts");
}

isolated function generateKeyMaterial() returns string {
    return uuid:createRandomUuid() + uuid:createRandomUuid();
}

// Create a new org-level secret for the given environment.
// Returns the full secret string `<keyId>.<keyMaterial>` — shown once, never retrievable again.
public isolated function createOrgSecret(string environmentId, string createdBy) returns string|error {
    string keyId = check generateKeyId();
    string keyMaterial = generateKeyMaterial();

    log:printDebug(string `createOrgSecret: inserting keyId=${keyId} for environment=${environmentId}, createdBy=${createdBy}`);

    sql:ExecutionResult|sql:Error result = dbClient->execute(`
        INSERT INTO org_secrets (key_id, environment_id, key_material, created_by)
        VALUES (${keyId}, ${environmentId}, ${keyMaterial}, ${createdBy})
    `);

    if result is sql:Error {
        log:printError(string `createOrgSecret: insert failed for keyId=${keyId}, environment=${environmentId}`, 'error = result);
        match classifySqlError(result) {
            DUPLICATE_KEY => {
                return error("A secret with this key ID already exists. Please retry.", result);
            }
            FOREIGN_KEY_VIOLATION => {
                return error("The specified environment does not exist", result);
            }
            _ => {
                return error("Failed to create org secret", result);
            }
        }
    }

    log:printInfo(string `createOrgSecret: created keyId=${keyId} for environment=${environmentId}`);
    return keyId + "." + keyMaterial;
}

// List all org-level secrets, optionally filtered by environment.
// Returns truncated entries (keyId + "....") — key material is never returned.
public isolated function listOrgSecrets(string? environmentId = ()) returns types:OrgSecretListEntry[]|error {
    log:printDebug(string `listOrgSecrets: environmentId=${environmentId ?: "all"}`);

    sql:ParameterizedQuery query = `
        SELECT os.key_id, os.environment_id, e.name AS environment_name,
               CASE WHEN os.component_id IS NOT NULL THEN TRUE ELSE FALSE END AS bound,
               os.created_at, os.created_by
        FROM org_secrets os
        JOIN environments e ON os.environment_id = e.environment_id`;

    if environmentId is string {
        query = sql:queryConcat(query, ` WHERE os.environment_id = ${environmentId}`);
    }

    query = sql:queryConcat(query, ` ORDER BY os.created_at DESC`);

    stream<record {|
        string key_id;
        string environment_id;
        string environment_name;
        boolean bound;
        string created_at;
        string? created_by;
    |}, sql:Error?> s = dbClient->query(query);

    types:OrgSecretListEntry[] entries = [];
    check from var row in s
        do {
            entries.push({
                keyId: row.key_id,
                environmentId: row.environment_id,
                environmentName: row.environment_name,
                bound: row.bound,
                createdAt: row.created_at,
                createdBy: getDisplayNameById(row.created_by)
            });
        };

    log:printDebug(string `listOrgSecrets: found ${entries.length()} entries`);
    return entries;
}

// Revoke (delete) an org secret by key ID.
public isolated function revokeOrgSecret(string keyId) returns error? {
    log:printDebug(string `revokeOrgSecret: keyId=${keyId}`);

    sql:ExecutionResult|sql:Error result = dbClient->execute(
        `DELETE FROM org_secrets WHERE key_id = ${keyId}`
    );

    if result is sql:Error {
        log:printError(string `revokeOrgSecret: delete failed for keyId=${keyId}`, 'error = result);
        return error("Failed to revoke org secret", result);
    }

    if result is sql:ExecutionResult && result.affectedRowCount == 0 {
        log:printWarn(string `revokeOrgSecret: keyId=${keyId} not found`);
        return error(string `Secret with key ID '${keyId}' not found`);
    }

    log:printInfo(string `revokeOrgSecret: revoked keyId=${keyId}`);
}

// ---------------------------------------------------------------------------
// M2: kid-based secret lookup, binding, and auto-creation
// ---------------------------------------------------------------------------

isolated function inferComponentType(string runtimeType) returns string {
    if runtimeType == "MI" {
        return "MI";
    }
    return "BI";
}

public isolated function lookupOrgSecretByKeyId(string keyId) returns types:OrgSecret|error {
    log:printDebug(string `lookupOrgSecretByKeyId: keyId=${keyId}`);

    stream<types:OrgSecret, sql:Error?> s = dbClient->query(`
        SELECT key_id, environment_id, key_material, project_id, component_id,
               project_handler, component_name, runtime_type, bound_at, created_at, created_by
        FROM org_secrets WHERE key_id = ${keyId}
    `);
    types:OrgSecret[] rows = check from types:OrgSecret r in s select r;

    if rows.length() == 0 {
        log:printWarn(string `lookupOrgSecretByKeyId: keyId=${keyId} not found`);
        return error(string `Unknown key ID '${keyId}'`);
    }

    log:printDebug(string `lookupOrgSecretByKeyId: found keyId=${keyId}, bound=${rows[0].componentId is string}`);
    return rows[0];
}

public isolated function bindOrgSecret(string keyId, string projectId, string componentId,
        string projectHandler, string componentName, string runtimeType) returns error? {
    log:printDebug(string `bindOrgSecret: keyId=${keyId}, projectId=${projectId}, componentId=${componentId}, runtimeType=${runtimeType}`);

    sql:ExecutionResult result = check dbClient->execute(`
        UPDATE org_secrets
        SET project_id = ${projectId}, component_id = ${componentId},
            project_handler = ${projectHandler}, component_name = ${componentName},
            runtime_type = ${runtimeType},
            bound_at = CURRENT_TIMESTAMP
        WHERE key_id = ${keyId} AND component_id IS NULL
    `);

    if result.affectedRowCount == 0 {
        types:OrgSecret current = check lookupOrgSecretByKeyId(keyId);
        if current.projectId != projectId || current.componentId != componentId {
            log:printWarn(string `bindOrgSecret: race — keyId=${keyId} already bound to project=${current.projectId ?: "?"}, component=${current.componentId ?: "?"}`);
            return error(string `Key ID '${keyId}' is already bound to a different project/component`);
        }
        log:printDebug(string `bindOrgSecret: keyId=${keyId} already bound to same project/component — no-op`);
        return;
    }

    log:printInfo(string `bindOrgSecret: bound keyId=${keyId} to project=${projectId}, component=${componentId}`);
}

public isolated function updateRuntimeKeyId(string runtimeId, string keyId) returns error? {
    log:printDebug(string `updateRuntimeKeyId: runtimeId=${runtimeId}, keyId=${keyId}`);

    _ = check dbClient->execute(`
        UPDATE runtimes SET key_id = ${keyId} WHERE runtime_id = ${runtimeId}
    `);

    log:printDebug(string `updateRuntimeKeyId: recorded keyId=${keyId} on runtime=${runtimeId}`);
}

public isolated function resolveOrCreateProject(string handler, string createdBy) returns string|error {
    log:printDebug(string `resolveOrCreateProject: handler=${handler}, createdBy=${createdBy}`);

    string|error existing = getProjectIdByHandler(handler, DEFAULT_ORG_ID);
    if existing is string {
        log:printDebug(string `resolveOrCreateProject: found existing project=${existing} for handler=${handler}`);
        return existing;
    }

    log:printInfo(string `resolveOrCreateProject: auto-creating project for handler=${handler}`);
    string projectId = uuid:createType1AsString();
    transaction {
        _ = check dbClient->execute(`
            INSERT INTO projects (project_id, org_id, name, handler, owner_id, created_by)
            VALUES (${projectId}, ${DEFAULT_ORG_ID}, ${handler}, ${handler}, ${createdBy}, ${createdBy})
        `);

        string adminGroupId = uuid:createType1AsString();
        string groupName = string `${handler} Admins`;

        sql:ExecutionResult|sql:Error groupRes = dbClient->execute(`
            INSERT INTO user_groups (group_id, group_name, org_uuid, description)
            VALUES (${adminGroupId}, ${groupName}, ${DEFAULT_ORG_ID}, ${string `Admin group for project: ${handler}`})
        `);
        if groupRes is sql:Error {
            log:printError(string `resolveOrCreateProject: failed to create admin group for handler=${handler}`, 'error = groupRes);
            fail error("Failed to set up project admin group", groupRes);
        }

        string roleId = check getProjectAdminRoleId();

        sql:ExecutionResult|sql:Error roleRes = dbClient->execute(`
            INSERT INTO group_role_mapping (group_id, role_id, org_uuid, project_uuid)
            VALUES (${adminGroupId}, ${roleId}, ${DEFAULT_ORG_ID}, ${projectId})
        `);
        if roleRes is sql:Error {
            log:printError(string `resolveOrCreateProject: failed to map admin role for handler=${handler}`, 'error = roleRes);
            fail error("Failed to set up project admin role", roleRes);
        }

        sql:ExecutionResult|sql:Error userRes = dbClient->execute(`
            INSERT INTO group_user_mapping (group_id, user_uuid)
            VALUES (${adminGroupId}, ${createdBy})
        `);
        if userRes is sql:Error {
            log:printError(string `resolveOrCreateProject: failed to add creator to admin group for handler=${handler}`, 'error = userRes);
            fail error("Failed to add user to project admin group", userRes);
        }

        check commit;
    } on fail error e {
        log:printError(string `resolveOrCreateProject: transaction failed for handler=${handler}`, 'error = e);
        return error(string `Failed to auto-create project '${handler}'`, e);
    }

    log:printInfo(string `resolveOrCreateProject: created project=${projectId} for handler=${handler}`);
    return projectId;
}

public isolated function resolveOrCreateComponent(string projectId, string name, string runtimeType, string createdBy) returns string|error {
    log:printDebug(string `resolveOrCreateComponent: projectId=${projectId}, name=${name}, runtimeType=${runtimeType}`);

    stream<record {|string component_id;|}, sql:Error?> s = dbClient->query(`
        SELECT component_id FROM components WHERE project_id = ${projectId} AND name = ${name}
    `);
    record {|string component_id;|}[] rows = check from record {|string component_id;|} r in s select r;

    if rows.length() > 0 {
        log:printDebug(string `resolveOrCreateComponent: found existing component=${rows[0].component_id}`);
        return rows[0].component_id;
    }

    log:printInfo(string `resolveOrCreateComponent: auto-creating component=${name} under project=${projectId}`);
    string componentId = uuid:createType1AsString();
    string componentType = inferComponentType(runtimeType);

    sql:ExecutionResult|sql:Error result = dbClient->execute(`
        INSERT INTO components (component_id, project_id, name, display_name, component_type, created_by)
        VALUES (${componentId}, ${projectId}, ${name}, ${name}, ${componentType}, ${createdBy})
    `);

    if result is sql:Error {
        log:printError(string `resolveOrCreateComponent: insert failed for name=${name}, project=${projectId}`, 'error = result);
        if classifySqlError(result) == DUPLICATE_KEY {
            stream<record {|string component_id;|}, sql:Error?> retryStream = dbClient->query(
                `SELECT component_id FROM components WHERE project_id = ${projectId} AND name = ${name}`
            );
            record {|string component_id;|}[] existing = check from record {|string component_id;|} r in retryStream select r;
            if existing.length() > 0 {
                return existing[0].component_id;
            }
        }
        return error(string `Failed to auto-create component '${name}'`, result);
    }

    log:printInfo(string `resolveOrCreateComponent: created component=${componentId}, type=${componentType}`);
    return componentId;
}

public isolated function updateOrgSecretsComponentName(string componentId, string newName) returns error? {
    log:printDebug(string `updateOrgSecretsComponentName: componentId=${componentId}, newName=${newName}`);

    sql:ExecutionResult result = check dbClient->execute(`
        UPDATE org_secrets SET component_name = ${newName}
        WHERE component_id = ${componentId}
    `);

    log:printInfo(string `updateOrgSecretsComponentName: updated ${result.affectedRowCount ?: 0} rows for componentId=${componentId}`);
}

public isolated function updateOrgSecretsProjectHandler(string projectId, string newHandler) returns error? {
    log:printDebug(string `updateOrgSecretsProjectHandler: projectId=${projectId}, newHandler=${newHandler}`);

    sql:ExecutionResult result = check dbClient->execute(`
        UPDATE org_secrets SET project_handler = ${newHandler}
        WHERE project_id = ${projectId}
    `);

    log:printInfo(string `updateOrgSecretsProjectHandler: updated ${result.affectedRowCount ?: 0} rows for projectId=${projectId}`);
}
