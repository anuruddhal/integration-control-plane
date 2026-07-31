-- Migration: Moesif dashboard embed columns on components (Microsoft SQL Server)
-- Adds the columns needed to embed the Moesif metrics dashboard in the ICP UI:
--   components.moesif_workspace_id   - the Moesif workspace id backing the
--                                      "Metrics" dashboard; used in the embed URL
--                                      and to mint workspace access tokens.
--   components.moesif_dashboard_id   - the Moesif "Metrics" (child) dashboard id.
--   components.moesif_management_key - the Moesif Management API key used to mint
--                                      short-lived workspace access tokens on
--                                      demand (JWT-like token; can be long).
-- Idempotent - safe to re-run. Fresh installs get these from mssql_init.sql.
-- Run once against the main ICP DB.

IF COL_LENGTH('components', 'moesif_workspace_id') IS NULL
    ALTER TABLE components ADD moesif_workspace_id NVARCHAR(512) NULL;
GO

IF COL_LENGTH('components', 'moesif_dashboard_id') IS NULL
    ALTER TABLE components ADD moesif_dashboard_id NVARCHAR(512) NULL;
GO

IF COL_LENGTH('components', 'moesif_management_key') IS NULL
    ALTER TABLE components ADD moesif_management_key NVARCHAR(4000) NULL;
GO
