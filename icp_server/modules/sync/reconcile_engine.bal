import icp_server.storage;
import icp_server.types;

import ballerina/log;
import ballerina/time;

// Pure diff — one-directional, only iterates desired keys.
// Keys in observed but not in desired are ignored.
public isolated function reconcile(map<string> desired, map<string> observed) returns types:ReconcileAction[] {
    types:ReconcileAction[] actions = [];
    foreach var [key, value] in desired.entries() {
        if value != observed[key] {
            actions.push({key: key, value: value});
        }
    }
    return actions;
}

// Backoff interval in seconds.
// Dispatch error:  30s -> 1m -> 2m -> 4m -> 8m -> 15m (cap)
// Stuck state:     attempts 1-3: no backoff; 4+: 1m -> 2m -> 4m -> 8m -> 15m (cap)
public isolated function backoffInterval(int attemptCount, boolean hasError) returns int {
    if !hasError && attemptCount <= 3 {
        return 0;
    }
    int effectiveAttempt = hasError ? attemptCount : attemptCount - 3;
    int base = hasError ? 30 : 60;
    int interval = base * (1 << (effectiveAttempt - 1));
    return int:min(interval, 900);
}

// Reconcile a single artifact on a single runtime.
// Reads desired+observed, diffs, filters backoff, dispatches eligible actions.
public isolated function reconcileArtifact(string runtimeId, string componentId, string envId,
        types:ReconcileArtifactKey artifact, types:DispatchFn dispatchFn) returns types:ControlCommand[]|error? {
    log:printDebug("reconcileArtifact", runtimeId = runtimeId, componentId = componentId,
            envId = envId, artifactName = artifact.artifactName, artifactType = artifact.artifactType);

    map<string> desired = check storage:readReconcileDesiredState(componentId, envId, artifact);
    map<string> observed = check storage:readReconcileObservedState(runtimeId, artifact);
    types:ReconcileAction[] actions = reconcile(desired, observed);

    types:ReconcileBackoffRecord[] backoffRecords = check storage:readReconcileBackoff(runtimeId, artifact);
    map<types:ReconcileBackoffRecord> backoffMap = {};
    foreach types:ReconcileBackoffRecord rec in backoffRecords {
        backoffMap[rec.state_key] = rec;
    }

    int now = time:utcNow()[0];
    types:ReconcileAction[] eligible = [];
    foreach types:ReconcileAction a in actions {
        types:ReconcileBackoffRecord? rec = backoffMap[a.key];
        if rec is () || rec.next_attempt <= now {
            eligible.push(a);
        } else {
            log:printDebug("action backed off", runtimeId = runtimeId, stateKey = a.key,
                    nextAttempt = rec.next_attempt);
        }
    }

    log:printDebug("reconcileArtifact diff", runtimeId = runtimeId,
            totalDrift = actions.length(), eligible = eligible.length());

    types:ControlCommand[] commands = [];

    if eligible.length() > 0 {
        types:ControlCommand[]|error? dispatchResult = dispatchFn(runtimeId, artifact, eligible);
        if dispatchResult is error {
            if dispatchResult is types:PartialDispatchError {
                log:printError("Partial dispatch failure during reconciliation", runtimeId = runtimeId,
                        artifactName = artifact.artifactName, err = dispatchResult.message());
                types:PartialDispatchDetail detail = dispatchResult.detail();
                if detail.applied.length() > 0 {
                    check doRecordAttempt(runtimeId, artifact, detail.applied, backoffMap);
                    check doOptimisticUpdate(runtimeId, componentId, envId, artifact, detail.applied);
                }
                if detail.failed.length() > 0 {
                    check doRecordFailure(runtimeId, artifact, detail.failed, backoffMap);
                }
            } else {
                log:printError("Failed to dispatch reconciliation actions", runtimeId = runtimeId,
                        artifactName = artifact.artifactName, err = dispatchResult.message());
                check doRecordFailure(runtimeId, artifact, eligible, backoffMap);
            }
            return dispatchResult;
        }
        if dispatchResult is types:ControlCommand[] {
            commands = dispatchResult;
        }
        log:printDebug("dispatch succeeded", runtimeId = runtimeId, actionCount = eligible.length());
        check doRecordAttempt(runtimeId, artifact, eligible, backoffMap);
        check doOptimisticUpdate(runtimeId, componentId, envId, artifact, eligible);
    }

    check doClearConverged(runtimeId, artifact, actions, backoffMap);
    return commands;
}

// Reconcile one artifact across all runtimes. Continues on failure.
public isolated function reconcileArtifactAllRuntimes(string[] runtimeIds, string componentId, string envId,
        types:ReconcileArtifactKey artifact, types:DispatchFn dispatchFn) returns error? {
    log:printDebug("reconcileArtifactAllRuntimes", componentId = componentId,
            envId = envId, runtimeCount = runtimeIds.length());
    error[] errors = [];
    foreach string runtimeId in runtimeIds {
        types:ControlCommand[]|error? result = reconcileArtifact(runtimeId, componentId, envId, artifact, dispatchFn);
        if result is error {
            errors.push(result);
        }
    }
    if errors.length() > 0 {
        return error(string `reconcile failed for ${errors.length()} runtimes`);
    }
}

// Clean up all reconcile state for a permanently removed runtime.
public isolated function reconcileDeleteRuntime(string runtimeId) returns error? {
    log:printDebug("reconcileDeleteRuntime", runtimeId = runtimeId);
    check storage:deleteReconcileRuntime(runtimeId);
}

// Clean up all reconcile state for a component removed from an env.
public isolated function reconcileDeleteComponent(string componentId, string envId) returns error? {
    log:printDebug("reconcileDeleteComponent", componentId = componentId, envId = envId);
    check storage:deleteReconcileComponent(componentId, envId);
}

// Clean up all reconcile state for a permanently removed environment.
public isolated function reconcileDeleteEnvironment(string envId) returns error? {
    log:printDebug("reconcileDeleteEnvironment", envId = envId);
    check storage:deleteReconcileEnvironment(envId);
}

// --- Internal helpers ---

isolated function doRecordAttempt(string runtimeId, types:ReconcileArtifactKey artifact,
        types:ReconcileAction[] actions, map<types:ReconcileBackoffRecord> backoffMap) returns error? {
    int now = time:utcNow()[0];
    foreach types:ReconcileAction a in actions {
        types:ReconcileBackoffRecord? existing = backoffMap[a.key];
        int count = (existing is types:ReconcileBackoffRecord ? existing.attempt_count : 0) + 1;
        int intervalSec = backoffInterval(count, false);
        log:printDebug("recordAttempt", runtimeId = runtimeId, stateKey = a.key,
                attempt = count, nextBackoffSec = intervalSec);
        check storage:upsertReconcileBackoff(runtimeId, artifact, a.key, count, 0, now + intervalSec);
    }
}

isolated function doRecordFailure(string runtimeId, types:ReconcileArtifactKey artifact,
        types:ReconcileAction[] actions, map<types:ReconcileBackoffRecord> backoffMap) returns error? {
    int now = time:utcNow()[0];
    foreach types:ReconcileAction a in actions {
        types:ReconcileBackoffRecord? existing = backoffMap[a.key];
        int count = (existing is types:ReconcileBackoffRecord ? existing.attempt_count : 0) + 1;
        int intervalSec = backoffInterval(count, true);
        log:printDebug("recordFailure", runtimeId = runtimeId, stateKey = a.key,
                attempt = count, backoffSec = intervalSec);
        check storage:upsertReconcileBackoff(runtimeId, artifact, a.key, count, 1, now + intervalSec);
    }
}

isolated function doOptimisticUpdate(string runtimeId, string componentId, string envId,
        types:ReconcileArtifactKey artifact, types:ReconcileAction[] actions) returns error? {
    map<string> state = {};
    foreach types:ReconcileAction a in actions {
        state[a.key] = a.value;
    }
    log:printDebug("optimisticUpdate", runtimeId = runtimeId,
            artifactName = artifact.artifactName, keys = state.keys().toString());
    check storage:optimisticUpsertObservedState(runtimeId, componentId, envId, artifact, state);
}

// Seconds to keep a converged backoff record alive before deleting it.
// Prevents immediate re-dispatch when an artifact briefly converges and then
// regresses (e.g. a listener that starts and quickly fails), which would
// otherwise clear the attempt counter and reset the backoff to zero.
const int CONVERGENCE_STABILITY_COOLDOWN_SEC = 30;

isolated function doClearConverged(string runtimeId, types:ReconcileArtifactKey artifact,
        types:ReconcileAction[] currentActions, map<types:ReconcileBackoffRecord> backoffMap) returns error? {
    string[] activeKeys = from types:ReconcileAction a in currentActions
        select a.key;
    log:printDebug("clearConverged", runtimeId = runtimeId,
            artifactName = artifact.artifactName, activeKeyCount = activeKeys.length());

    // Build an active-key lookup set for O(1) checks.
    map<boolean> activeKeySet = {};
    foreach string k in activeKeys {
        activeKeySet[k] = true;
    }

    // For converged keys that had prior dispatch attempts, preserve the backoff
    // record during the cooldown window and only decrement the attempt count
    // once the window has expired.  Gating on rec.next_attempt <= now prevents
    // rapid heartbeat passes from burning through the counter faster than the
    // cooldown period — e.g. with attempt_count=4 (60 s backoff), six 10 s
    // heartbeats would otherwise zero the count before a single cooldown fires.
    int now = time:utcNow()[0];
    string[] skipDeleteKeys = activeKeys.clone();
    foreach var [stateKey, rec] in backoffMap.entries() {
        if !activeKeySet.hasKey(stateKey) && rec.attempt_count > 0 {
            skipDeleteKeys.push(stateKey);
            if rec.next_attempt <= now {
                int newCount = rec.attempt_count - 1;
                check storage:upsertReconcileBackoff(runtimeId, artifact, stateKey, newCount, 0, now + CONVERGENCE_STABILITY_COOLDOWN_SEC);
            }
        }
    }

    check storage:deleteReconcileBackoffConverged(runtimeId, artifact, skipDeleteKeys);
}
