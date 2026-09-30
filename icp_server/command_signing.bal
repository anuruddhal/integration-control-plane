// Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com) All Rights Reserved.
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

import ballerina/crypto;
import ballerina/log;

// ============================================================================
// SIGNED HEARTBEAT COMMANDS
// ============================================================================
// Every command a heartbeat response carries — a BI start/stop or log level from
// reconcile, a tunneled workflow or MI management call — is signed, so the runtime can tell
// a command from the ICP from one put into the response on the way. The runtime otherwise
// has only the TLS connection to go on, and a BI bridge does not verify the ICP's
// certificate unless `enableSSL` is set.
//
// The key is the org secret the runtime just authenticated this heartbeat with, so the
// runtime already holds it and nothing new is exchanged or configured.

// Names the field list below, so it can change without a runtime mistaking one for another.
const string COMMAND_SIGNATURE_VERSION = "v1";

# The bytes a command's signature covers.
#
# Every field the runtime acts on, each as `<UTF-8 byte length>:<value>` so no field can run
# into the next. The values are the ones sent — the payload is the JSON string exactly as it
# goes out — so the two sides never have to agree on how JSON is written, only on these
# bytes. The runtime id binds a command to the replica it was issued for: replicas share a
# key, and without it one replica's command could be replayed to another.
isolated function commandSigningInput(string runtimeId, types:ControlCommand command) returns byte[] {
    anydata artifactPackage = command.targetArtifact["package"];
    string[] fields = [
        COMMAND_SIGNATURE_VERSION,
        runtimeId,
        command.commandId,
        command.action,
        command.targetArtifact.name,
        artifactPackage is string ? artifactPackage : "",
        command.payload ?: ""
    ];
    string input = "";
    foreach string 'field in fields {
        input += 'field.toBytes().length().toString() + ":" + 'field;
    }
    return input.toBytes();
}

# HMAC-SHA256 of `commandSigningInput`, Base64.
isolated function signCommand(string runtimeId, types:ControlCommand command, string keyMaterial)
        returns string|error =>
    (check crypto:hmacSha256(commandSigningInput(runtimeId, command), keyMaterial.toBytes())).toBase64();

# Signs every command in a heartbeat response, in place. Called last, once reconcile and the
# tunnel have added theirs. A command that cannot be signed is left unsigned rather than
# dropped: a runtime that requires signatures refuses it, and one that does not yet runs it
# as it always has.
isolated function signHeartbeatCommands(string runtimeId, types:HeartbeatResponse response,
        string keyMaterial) {
    foreach types:ControlCommand command in response.commands ?: [] {
        string|error signature = signCommand(runtimeId, command, keyMaterial);
        if signature is error {
            log:printError("Failed to sign a heartbeat command", signature, commandId = command.commandId);
            continue;
        }
        command.signature = signature;
    }
}
