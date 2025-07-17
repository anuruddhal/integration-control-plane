configurable string serverUrl = ?;
configurable string authToken = ?;
configurable decimal heartbeatInterval = 30.0;
configurable string opensearchURL = ?;
configurable string logIndex = ?;
configurable boolean metricsEnabled = false;

public function loadConfig() returns IcpConfig|error {
    IcpConfig config = {
        icp: {
            serverUrl: serverUrl,
            authToken: authToken,
            heartbeatInterval: heartbeatInterval
        },
        observability: {
            opensearchUrl: opensearchURL,
            logIndex: logIndex,
            metricsEnabled: metricsEnabled
        },
        runtime: {
            id: "id",
            environment: "K8S"
        }
    };
    return config;
}
