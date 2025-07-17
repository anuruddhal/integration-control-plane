import ballerina/log;
import ballerina/task;

public function main() returns error? {
    // Load configuration
    IcpConfig config = check loadConfig();

    // Initialize ICP client
    IcpClient icpClient = check new (config);

    // Get initial integration status
    IntegrationStatus[] integrations = getCurrentIntegrations();

    // Register with ICP server
    check icpClient->registerRuntime(integrations);

    // Start periodic heartbeat
    HeartbeatJob heartbeatJob = new (icpClient, config.icp.heartbeatInterval);
    task:JobId|task:Error result = task:scheduleJobRecurByFrequency(heartbeatJob, config.icp.heartbeatInterval);

    if result is task:Error {
        log:printError("Failed to start heartbeat job", result);
        return error("Heartbeat scheduling failed");
    }

    log:printInfo("ICP Agent started successfully");
}

// Heartbeat job
public class HeartbeatJob {
    *task:Job;
    private final IcpClient icpClient;
    private final decimal interval;

    public function init(IcpClient icpClient, decimal interval) {
        self.icpClient = icpClient;
        self.interval = interval;
    }

    public function execute() {
        IntegrationStatus[] integrations = getCurrentIntegrations();
        error? result = self.icpClient->sendHeartbeat(integrations);
        if result is error {
            log:printError("Failed to send heartbeat", result);
        } else {
            log:printInfo("Heartbeat sent successfully");
        }
    }
}
