-- Migration: service-to-listener bindings (PostgreSQL)
-- Adds the bi_service_listener_bindings table, which records which listener(s)
-- each service is attached to. The binding arrives in the runtime heartbeat
-- (heartbeat.artifacts.services[].listeners) and is keyed to
-- bi_runtime_listener_artifacts by (runtime_id, listener_name). Many-to-many:
-- a service may bind multiple listeners; a listener may serve multiple services.
-- Idempotent - safe to re-run. Fresh installs get this from postgresql_init.sql.
-- Run once against the main ICP DB.

CREATE TABLE IF NOT EXISTS bi_service_listener_bindings (
    runtime_id CHAR(36) NOT NULL,
    service_name VARCHAR(100) NOT NULL,
    service_package VARCHAR(200) NOT NULL,
    listener_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, service_name, service_package, listener_name),
    CONSTRAINT fk_bi_slb_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_slb_service ON bi_service_listener_bindings (runtime_id, service_name, service_package);
CREATE INDEX IF NOT EXISTS idx_slb_listener ON bi_service_listener_bindings (runtime_id, listener_name);
