-- Migration: service-to-listener bindings (Microsoft SQL Server)
-- Adds the bi_service_listener_bindings table, which records which listener(s)
-- each service is attached to. The binding arrives in the runtime heartbeat
-- (heartbeat.artifacts.services[].listeners) and is keyed to
-- bi_runtime_listener_artifacts by (runtime_id, listener_name). Many-to-many:
-- a service may bind multiple listeners; a listener may serve multiple services.
-- Idempotent - safe to re-run. Fresh installs get this from mssql_init.sql.
-- Run once against the main ICP DB.

IF OBJECT_ID('bi_service_listener_bindings', 'U') IS NULL
CREATE TABLE bi_service_listener_bindings (
    runtime_id CHAR(36) NOT NULL,
    service_name NVARCHAR (100) NOT NULL,
    service_package NVARCHAR (200) NOT NULL,
    listener_name NVARCHAR (100) NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    PRIMARY KEY (runtime_id, service_name, service_package, listener_name),
    CONSTRAINT fk_bi_slb_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_slb_service (runtime_id, service_name, service_package),
    INDEX idx_slb_listener (runtime_id, listener_name)
);
GO
