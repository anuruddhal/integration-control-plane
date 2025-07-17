import ballerina/sql;
import ballerina/time;

public isolated client class IntegrationRepository {
    private final sql:Client dbClient;

    public function init(sql:Client dbClient) {
        self.dbClient = dbClient;
    }

    public isolated function create(Integration integration) returns Integration|error {
        sql:ParameterizedQuery query = `INSERT INTO integrations 
            (id, name, version, runtime_id, status, logs_enabled, metrics_enabled, last_updated)
            VALUES (${integration.id}, ${integration.name}, ${integration.version}, 
                    ${integration.runtimeId}, ${integration.status}, 
                    ${integration.logsEnabled}, ${integration.metricsEnabled}, 
                    ${integration.lastUpdated})
            RETURNING *`;

        sql:ExecutionResult _ = check self.dbClient->execute(query);
        return integration;
    }

    public isolated function updateStatus(string runtimeId, string integrationName, "RUNNING"|"FAILED"|"DISABLED" status,
            time:Utc timestamp
    ) returns boolean|error {
        sql:ParameterizedQuery query = `UPDATE integrations 
            SET status = ${status}, last_updated = ${timestamp} 
            WHERE runtime_id = ${runtimeId} AND name = ${integrationName}`;
        sql:ExecutionResult result = check self.dbClient->execute(query);
        return result.affectedRowCount > 0;
    }
}
