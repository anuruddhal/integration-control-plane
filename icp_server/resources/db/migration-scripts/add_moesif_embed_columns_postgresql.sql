-- Migration: Moesif dashboard embed columns on components (PostgreSQL)
-- Adds the columns needed to embed the Moesif metrics dashboard in the ICP UI:
--   components.moesif_workspace_id   - the Moesif workspace id backing the
--                                      "Metrics" dashboard; used in the embed URL
--                                      and to mint workspace access tokens.
--   components.moesif_dashboard_id   - the Moesif "Metrics" (child) dashboard id.
--   components.moesif_management_key - the Moesif Management API key used to mint
--                                      short-lived workspace access tokens on
--                                      demand (JWT-like token; can be long).
-- Idempotent - safe to re-run. Fresh installs get these from postgresql_init.sql.
-- Run once against the main ICP DB.

ALTER TABLE components ADD COLUMN IF NOT EXISTS moesif_workspace_id VARCHAR(512) NULL;
ALTER TABLE components ADD COLUMN IF NOT EXISTS moesif_dashboard_id VARCHAR(512) NULL;
ALTER TABLE components ADD COLUMN IF NOT EXISTS moesif_management_key VARCHAR(4096) NULL;
