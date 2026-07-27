-- Migration: service-to-listener bindings (Oracle 19c+)
-- Adds the bi_service_listener_bindings table, which records which listener(s)
-- each service is attached to. The binding arrives in the runtime heartbeat
-- (heartbeat.artifacts.services[].listeners) and is keyed to
-- bi_runtime_listener_artifacts by (runtime_id, listener_name). Many-to-many:
-- a service may bind multiple listeners; a listener may serve multiple services.
-- Idempotent - safe to re-run. Fresh installs get this from oracle_init.sql.
-- Run once against the main ICP DB (as the ICP schema owner).
--
-- Idempotency checks the specific expected object in the data dictionary before
-- creating it. A name collision with a DIFFERENT object type is NOT swallowed:
-- the CREATE then raises ORA-00955 so incompatible schema state surfaces.

DECLARE
    v_exists NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_exists FROM user_tables WHERE table_name = 'BI_SERVICE_LISTENER_BINDINGS';
    IF v_exists = 0 THEN
        EXECUTE IMMEDIATE 'CREATE TABLE bi_service_listener_bindings (
            runtime_id CHAR(36) NOT NULL,
            service_name VARCHAR2(100 CHAR) NOT NULL,
            service_package VARCHAR2(200 CHAR) NOT NULL,
            listener_name VARCHAR2(100 CHAR) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            PRIMARY KEY (runtime_id, service_name, service_package, listener_name),
            CONSTRAINT fk_bi_slb_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE
        )';
    END IF;
END;
/

DECLARE
    v_exists NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_exists FROM user_indexes WHERE index_name = 'IDX_SLB_SERVICE';
    IF v_exists = 0 THEN
        EXECUTE IMMEDIATE 'CREATE INDEX idx_slb_service ON bi_service_listener_bindings (runtime_id, service_name, service_package)';
    END IF;
END;
/

DECLARE
    v_exists NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_exists FROM user_indexes WHERE index_name = 'IDX_SLB_LISTENER';
    IF v_exists = 0 THEN
        EXECUTE IMMEDIATE 'CREATE INDEX idx_slb_listener ON bi_service_listener_bindings (runtime_id, listener_name)';
    END IF;
END;
/
