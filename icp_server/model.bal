import ballerina/time;

// Runtime registration payload from MI/BI agents

public enum RuntimeType {
    MI,
    BI
}

public enum RuntimeStatus {
    RUNNING,
    FAILED,
    DISABLED
}

public type RuntimeRegistration record {
    string runtimeId;
    RuntimeType runtimeType;
    string version;
    string environment; // "K8S"|"VM"
    string hostname;
    string? region;
    string? zone;
    IntegrationMetadata[] integrations;
    boolean logsEnabled;
    boolean metricsEnabled;
};

// Integration metadata
public type IntegrationMetadata record {
    string name;
    string version;
    boolean logsEnabled;
    boolean metricsEnabled;
};

// Heartbeat payload
public type Heartbeat record {
    string runtimeId;
    IntegrationStatus[] integrations;
    string? opensearchUrl; // Optional override
    boolean? metricsEnabled; // Optional override
};

// Integration status in heartbeat
public type IntegrationStatus record {|
    string name;
    RuntimeStatus status;
|};

// Runtime database model
public type Runtime record {
    string id;
    string runtimeId;
    RuntimeType runtimeType;
    string version;
    string environment;
    string hostname;
    string? region;
    string? zone;
    boolean enabled = true;
    time:Utc lastHeartbeat;
};

// Integration database model
public type Integration record {
    string id;
    string name;
    string version;
    string runtimeId;
    RuntimeStatus status;
    boolean logsEnabled;
    boolean metricsEnabled;
    time:Utc lastUpdated;
};
