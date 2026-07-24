-- Migration: OpenAPI (Swagger) definitions in the full heartbeat (MySQL / MariaDB)
-- Adds the bi_service_openapi_definitions table for BI runtimes that report OpenAPI
-- definitions packed into their JAR (by the swagger-pack compiler plugin) via the full
-- heartbeat's optional openApiDefinitions field.
-- Idempotent - safe to re-run. Fresh installs get this from mysql_init.sql.
-- Run once against the main ICP DB.

CREATE TABLE IF NOT EXISTS bi_service_openapi_definitions (
  runtime_id  CHAR(36) NOT NULL,
  file_name   VARCHAR(300) NOT NULL,
  definition  JSON NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (runtime_id, file_name),
  CONSTRAINT fk_bi_service_openapi_definitions_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes(runtime_id) ON DELETE CASCADE,
  INDEX idx_runtime_id (runtime_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
