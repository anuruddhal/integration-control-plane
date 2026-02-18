// Copyright (c) 2025, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
//
// WSO2 Inc. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
//  http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.
import ballerina/log;
import ballerina/sql;
import ballerinax/h2.driver as _;
import ballerinax/java.jdbc as jdbc;
import ballerinax/mssql;
import ballerinax/mssql.driver as _;
import ballerinax/mysql;
import ballerinax/mysql.driver as _;
import ballerinax/postgresql;
import ballerinax/postgresql.driver as _;

enum DatabaseType {
    MYSQL = "mysql",
    H2 = "h2",
    MSSQL = "mssql",
    POSTGRESQL = "postgresql"
}

public client class DatabaseConnectionManager {
    private final sql:Client dbClient;
    private final string dbType;

    public function init(string dbType, string host, int port, string database, string user, string password, string? schema = ()) returns error? {
        self.dbType = dbType;
        sql:ConnectionPool pool = {
            maxOpenConnections: maxOpenConnections,
            minIdleConnections: minIdleConnections,
            maxConnectionLifeTime: maxConnectionLifeTime
        };

        string label = schema is string ? string `${schema} (${dbType})` : dbType;

        if dbType == MYSQL {
            log:printInfo(string `Initializing ${label} Database...`);
            self.dbClient = check new mysql:Client(host, user, password, database, port, connectionPool = pool);
            log:printInfo(string `${label} Database initialized successfully.`);
        } else if dbType == MSSQL {
            log:printInfo(string `Initializing ${label} Database...`);
            log:printInfo(string `Connecting to MSSQL: ${host}:${port}/${database}`);
            self.dbClient = check new mssql:Client(host = host, user = user, password = password, database = database, port = port, connectionPool = pool);
            log:printInfo(string `${label} Database initialized successfully.`);
        } else if dbType == POSTGRESQL {
            log:printInfo(string `Initializing ${label} Database...`);
            log:printInfo(string `Connecting to PostgreSQL: ${host}:${port}/${database}`);
            postgresql:Options? pgOptions = schema is string
                ? {currentSchema: schema}
                : ();
            self.dbClient = check new postgresql:Client(host = host, username = user, password = password, database = database, port = port, connectionPool = pool, options = pgOptions);
            log:printInfo(string `${label} Database initialized successfully.`);
        } else {
            string h2File = schema is string ? string `./database/${schema}` : "./database/icpdb";
            log:printInfo(string `Initializing ${label} Database...`);
            log:printDebug(string `H2 database file location: ${h2File}`);
            self.dbClient = check new jdbc:Client(string `jdbc:h2:file:${h2File};MODE=MySQL;AUTO_SERVER=TRUE`, user, password);
            log:printInfo(string `${label} Database initialized successfully.`);
        }
    }

    public isolated function getClient() returns sql:Client {
        return self.dbClient;
    }

    public isolated function close() returns error? {
        return self.dbClient.close();
    }
}
