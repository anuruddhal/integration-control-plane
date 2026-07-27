-- Migration: OpenAPI (Swagger) definitions in the full heartbeat (Microsoft SQL Server)
-- Adds the bi_service_openapi_definitions table for BI runtimes that report OpenAPI
-- definitions packed into their JAR (by the swagger-pack compiler plugin) via the full
-- heartbeat's optional openApiDefinitions field.
-- Idempotent - safe to re-run. Fresh installs get this from mssql_init.sql.
-- Run once against the main ICP DB.

IF OBJECT_ID('bi_service_openapi_definitions', 'U') IS NULL
BEGIN
    CREATE TABLE bi_service_openapi_definitions (
        runtime_id CHAR(36) NOT NULL,
        file_name NVARCHAR (300) NOT NULL,
        definition NVARCHAR (MAX) NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE (),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE (),
        PRIMARY KEY (
            runtime_id,
            file_name
        ),
        CONSTRAINT fk_bi_service_openapi_definitions_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
        INDEX idx_runtime_id (runtime_id)
    );
END
GO

DROP TRIGGER IF EXISTS trg_bi_service_openapi_definitions_updated_at;
GO

CREATE TRIGGER trg_bi_service_openapi_definitions_updated_at
ON bi_service_openapi_definitions
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE bi_service_openapi_definitions
    SET updated_at = GETDATE()
    FROM bi_service_openapi_definitions t
    INNER JOIN inserted i ON t.runtime_id = i.runtime_id
        AND t.file_name = i.file_name;
END;
GO
