-- Migration: service-to-listener bindings (Oracle 19c+)
-- Adds the bi_service_listener_bindings table, which records which listener(s)
-- each service is attached to. The binding arrives in the runtime heartbeat
-- (heartbeat.artifacts.services[].listeners) and is keyed to
-- bi_runtime_listener_artifacts by (runtime_id, listener_name). Many-to-many:
-- a service may bind multiple listeners; a listener may serve multiple services.
-- Idempotent - safe to re-run. Fresh installs get this from oracle_init.sql.
-- Run once against the main ICP DB (as the ICP schema owner).
-- (ORA-00955 = name already used by an existing object; ignored for idempotency.)

DECLARE
    e_exists EXCEPTION;
    PRAGMA EXCEPTION_INIT(e_exists, -955);
BEGIN
    EXECUTE IMMEDIATE 'CREATE TABLE bi_service_listener_bindings (
        runtime_id CHAR(36) NOT NULL,
        service_name VARCHAR2(100 CHAR) NOT NULL,
        service_package VARCHAR2(200 CHAR) NOT NULL,
        listener_name VARCHAR2(100 CHAR) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        PRIMARY KEY (runtime_id, service_name, service_package, listener_name),
        CONSTRAINT fk_bi_slb_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE
    )';
EXCEPTION
    WHEN e_exists THEN NULL;
END;
/

DECLARE
    e_exists EXCEPTION;
    PRAGMA EXCEPTION_INIT(e_exists, -955);
BEGIN
    EXECUTE IMMEDIATE 'CREATE INDEX idx_slb_service ON bi_service_listener_bindings (runtime_id, service_name, service_package)';
EXCEPTION
    WHEN e_exists THEN NULL;
END;
/

DECLARE
    e_exists EXCEPTION;
    PRAGMA EXCEPTION_INIT(e_exists, -955);
BEGIN
    EXECUTE IMMEDIATE 'CREATE INDEX idx_slb_listener ON bi_service_listener_bindings (runtime_id, listener_name)';
EXCEPTION
    WHEN e_exists THEN NULL;
END;
/
