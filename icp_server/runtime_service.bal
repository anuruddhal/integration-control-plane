import ballerina/time;
import ballerina/uuid;

service class RuntimeService {
    private final RuntimeRepository runtimeRepo;
    private final IntegrationRepository integrationRepo;

    function init(RuntimeRepository runtimeRepo, IntegrationRepository integrationRepo) {
        self.runtimeRepo = runtimeRepo;
        self.integrationRepo = integrationRepo;
    }

    public isolated function register(RuntimeRegistration payload) returns Runtime|error {
        // Create runtime record
        Runtime runtime = {
            id: uuid:createType1AsString(),
            runtimeId: payload.runtimeId,
            runtimeType: payload.runtimeType,
            version: payload.version,
            environment: payload.environment,
            hostname: payload.hostname,
            region: payload.region,
            zone: payload.zone,
            enabled: true,
            lastHeartbeat: time:utcNow()
        };

        // Save to database
        Runtime|error dbRuntime = self.runtimeRepo.create(runtime);
        if dbRuntime is error {
            return error("Failed to register runtime", dbRuntime);
        }

        // Register integrations
        foreach IntegrationMetadata integration in payload.integrations {
            Integration|error result = self.integrationRepo.create({
                id: uuid:createType1AsString(),
                name: integration.name,
                version: integration.version,
                runtimeId: runtime.id,
                status: "RUNNING",
                logsEnabled: integration.logsEnabled,
                metricsEnabled: integration.metricsEnabled,
                lastUpdated: time:utcNow()
            });
            if result is error {
                return error("Failed to register integration", result);
            }
        }

        return runtime;
    }

    public isolated function processHeartbeat(Heartbeat payload) returns boolean|error {
        // Update runtime heartbeat
        boolean|error heartbeatResult = self.runtimeRepo.updateHeartbeat(
            payload.runtimeId,
            time:utcNow()
        );
        if heartbeatResult is error {
            return error("Failed to update heartbeat", heartbeatResult);
        }

        // Update integration statuses
        foreach IntegrationStatus integration in payload.integrations {
            boolean|error statusUpdateResult = self.integrationRepo.updateStatus(
                payload.runtimeId,
                integration.name,
                integration.status,
                time:utcNow()
            );
            if statusUpdateResult is error {
                return error("Failed to update integration status", statusUpdateResult);
            }
        }

        return true;
    }

    public function getAllRuntimes() returns Runtime[]|error {
        return self.runtimeRepo.findAll();
    }
}
