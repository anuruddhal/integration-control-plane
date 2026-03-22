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
