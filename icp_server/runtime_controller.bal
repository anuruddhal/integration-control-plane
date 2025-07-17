import ballerina/http;
import ballerina/log;

service class RuntimeController {
    *http:Service;

    private final RuntimeService runtimeService;

    function init(RuntimeService runtimeService) {
        self.runtimeService = runtimeService;
    }

    @http:ResourceConfig {
        auth: {
            scopes: ["runtime:register"]
        }
    }
    isolated resource function post register(@http:Payload RuntimeRegistration payload)
    returns http:Created|http:BadRequest|http:InternalServerError {
        Runtime|error runtime = self.runtimeService.register(payload);
        if runtime is error {
            log:printError("Registration failed", 'error = runtime);
            return http:INTERNAL_SERVER_ERROR;
        }
        return http:CREATED;
    }

    @http:ResourceConfig {
        auth: {
            scopes: ["runtime:heartbeat"]
        }
    }
    isolated resource function post heartbeat(@http:Payload Heartbeat payload)
    returns http:Ok|http:BadRequest|http:InternalServerError {
        boolean|error result = self.runtimeService.processHeartbeat(payload);
        if result is error {
            log:printError("Heartbeat processing failed", 'error = result);
            return http:INTERNAL_SERVER_ERROR;
        }
        return http:OK;
    }

    @http:ResourceConfig {
        auth: {
            scopes: ["runtime:read"]
        }
    }
    resource function get runtimes() returns Runtime[]|http:InternalServerError {
        Runtime[]|error runtimes = self.runtimeService.getAllRuntimes();
        if runtimes is error {
            return http:INTERNAL_SERVER_ERROR;
        }
        return runtimes;
    }
}
