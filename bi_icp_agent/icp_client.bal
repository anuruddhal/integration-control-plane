import ballerina/http;
import ballerina/log;
import ballerina/os;

public client class IcpClient {
    private final string serverUrl;
    private final string authToken;
    private final string runtimeId;
    private final RuntimeType runtimeType;
    private final string environment;
    private final http:Client httpClient;
    private final IcpConfig config;

    public function init(IcpConfig config) returns http:ClientError? {
        self.serverUrl = config.icp.serverUrl;
        self.authToken = config.icp.authToken;
        self.runtimeId = config.runtime.id;
        self.runtimeType = config.runtime.runtimeType;
        self.environment = config.runtime.environment;
        self.config = config;
        self.httpClient = check new (self.serverUrl);
    }

    // Register runtime with ICP server
    isolated remote function registerRuntime(IntegrationStatus[] integrations) returns error? {
        RuntimeRegistration payload = {
            runtimeId: self.runtimeId,
            runtimeType: self.runtimeType,
            version: "2201.12.0",
            environment: self.environment,
            hostname: "localhost",
            integrations: [],
            metricsEnabled: self.config.observability.metricsEnabled
        };

        http:Request request = new;
        request.setHeader("Authorization", self.authToken);
        request.setPayload(payload);

        http:Response response = check self.httpClient->post("/register", request);
        if response.statusCode != http:STATUS_CREATED {
            log:printError("Failed to register runtime with ICP server");
            return error("Registration failed ");
        }
    }

    // Send heartbeat to ICP server
    isolated remote function sendHeartbeat(IntegrationStatus[] integrations) returns error? {
        Heartbeat payload = {
            runtimeId: self.runtimeId,
            integrations: integrations,
            opensearchUrl: self.config.observability.opensearchUrl,
            metricsEnabled: self.config.observability.metricsEnabled
        };

        http:Request request = new;
        request.setHeader("Authorization", self.authToken);
        request.setPayload(payload);

        http:Response response = check self.httpClient->post("/heartbeat", request);
        if response.statusCode != http:STATUS_OK {
            log:printWarn("Heartbeat failed: " + response.statusCode.toString());
            return error("Heartbeat failed");
        }
    }

    // Helper functions
    private function getHostname() returns string {
        return os:getEnv("HOSTNAME");
    }

    private function getRuntimeVersion() returns string {
        return "2201.12.0"; // Placeholder for actual version retrieval logic
    }

    private function toIntegrationMetadata(IntegrationStatus[] statuses) returns IntegrationMetadata[] {
        return from var status in statuses
            select {
                name: status.name,
                version: status.version,
                logsEnabled: status.logsEnabled,
                metricsEnabled: status.metricsEnabled
            };
    }
}
