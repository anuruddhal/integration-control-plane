import ballerina/sql;
import ballerina/time;

public isolated client class RuntimeRepository {
    private final sql:Client dbClient;

    public function init(sql:Client dbClient) {
        self.dbClient = dbClient;
    }

    public isolated function create(Runtime runtime) returns Runtime|error {
        sql:ParameterizedQuery query = `INSERT INTO runtimes 
            (id, runtime_id, type, version, environment, hostname, region, zone, enabled, last_heartbeat)
            VALUES (${runtime.id}, ${runtime.runtimeId}, ${runtime.runtimeType}, ${runtime.version}, 
                    ${runtime.environment}, ${runtime.hostname}, ${runtime.region}, 
                    ${runtime.zone}, ${runtime.enabled}, ${runtime.lastHeartbeat})`;

        _ = check self.dbClient->execute(query);
        return runtime;
    }

    public isolated function updateHeartbeat(string runtimeId, time:Utc timestamp)
    returns boolean|error {
        sql:ParameterizedQuery query = `UPDATE runtimes 
            SET last_heartbeat = ${timestamp} 
            WHERE runtime_id = ${runtimeId}`;
        sql:ExecutionResult result = check self.dbClient->execute(query);
        return result.affectedRowCount > 0;
    }

    public isolated function findAll() returns Runtime[]|error {
        sql:ParameterizedQuery query = `SELECT * FROM runtimes`;
        stream<Runtime, error?> resultStream =
            self.dbClient->query(query);

        Runtime[] runtimes = [];
        check from Runtime runtime in resultStream
            do {
                runtimes.push(runtime);
            };

        return runtimes;
    }
}
