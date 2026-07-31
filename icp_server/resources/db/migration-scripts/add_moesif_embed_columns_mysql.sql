-- Migration: Moesif dashboard embed columns on components (MySQL / MariaDB)
-- Adds the columns needed to embed the Moesif metrics dashboard in the ICP UI:
--   components.moesif_workspace_id   - the Moesif workspace id backing the
--                                      "Metrics" dashboard; used in the embed URL
--                                      and to mint workspace access tokens.
--   components.moesif_dashboard_id   - the Moesif "Metrics" (child) dashboard id.
--   components.moesif_management_key - the Moesif Management API key used to mint
--                                      short-lived workspace access tokens on
--                                      demand (JWT-like token; can be long).
-- Idempotent - safe to re-run. Fresh installs get these from mysql_init.sql.
-- Run once against the main ICP DB.
-- MySQL has no ADD COLUMN IF NOT EXISTS, so guard each column via information_schema.

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'components' AND COLUMN_NAME = 'moesif_workspace_id');
SET @ddl = IF(@col_exists = 0, 'ALTER TABLE components ADD COLUMN moesif_workspace_id VARCHAR(512) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'components' AND COLUMN_NAME = 'moesif_dashboard_id');
SET @ddl = IF(@col_exists = 0, 'ALTER TABLE components ADD COLUMN moesif_dashboard_id VARCHAR(512) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'components' AND COLUMN_NAME = 'moesif_management_key');
SET @ddl = IF(@col_exists = 0, 'ALTER TABLE components ADD COLUMN moesif_management_key VARCHAR(4096) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
