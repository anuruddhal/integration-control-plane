
# Heartbeat payload sent periodically
public type Heartbeat record {|
    string runtimeId;
    IntegrationStatus[] integrations;
    string? opensearchUrl;
    # Optional override
    boolean? metricsEnabled;
|};

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
    RuntimeType runtimeType = BI;
    string version?;
    string environment; // "K8S"|"VM"
    string hostname;
    string region?;
    string zone?;
    IntegrationMetadata[] integrations;
    boolean metricsEnabled;
};

public type IcpServer record {|
    string serverUrl;
    string authToken;
    decimal heartbeatInterval;
|};

public type Observability record {|
    string opensearchUrl;
    string logIndex;
    boolean metricsEnabled;
|};

public type Runtime record {|
    string id;
    RuntimeType runtimeType = "BI";
    string environment;
|};

public type IcpConfig record {|
    IcpServer icp;
    Observability observability;
    Runtime runtime;
|};

public type IntegrationMetadata record {|
    string name;
    string version;
    boolean logsEnabled;
    boolean metricsEnabled;
|};