-- Migration: OpenAPI (Swagger) definitions in the full heartbeat (Oracle 19c+)
-- Adds the bi_service_openapi_definitions table for BI runtimes that report OpenAPI
-- definitions packed into their JAR (by the swagger-pack compiler plugin) via the full
-- heartbeat's optional openApiDefinitions field.
-- Idempotent - safe to re-run. Fresh installs get this from oracle_init.sql.
-- Run once against the main ICP DB (as the ICP schema owner).

-- ORA-00955 = name already used by an existing object; ignored for idempotency
DECLARE
    e_object_exists EXCEPTION;
    PRAGMA EXCEPTION_INIT(e_object_exists, -955);
BEGIN
    EXECUTE IMMEDIATE '
        CREATE TABLE bi_service_openapi_definitions (
          runtime_id  CHAR(36) NOT NULL,
          file_name   VARCHAR2(300 CHAR) NOT NULL,
          definition  CLOB NOT NULL,
          created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          PRIMARY KEY (runtime_id, file_name),
          CONSTRAINT fk_bi_service_openapi_definitions_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE
        )';
EXCEPTION
    WHEN e_object_exists THEN NULL;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'CREATE INDEX idx_bi_svc_openapi_def_runtime_id ON bi_service_openapi_definitions (runtime_id)';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE != -955 THEN
            RAISE;
        END IF;
END;
/

CREATE OR REPLACE TRIGGER trg_bi_svc_openapi_def_updated
BEFORE UPDATE ON bi_service_openapi_definitions
FOR EACH ROW
BEGIN
    :NEW.updated_at := CURRENT_TIMESTAMP;
END;
/
