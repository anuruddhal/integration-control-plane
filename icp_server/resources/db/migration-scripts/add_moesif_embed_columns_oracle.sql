-- Migration: Moesif dashboard embed columns on components (Oracle 19c+)
-- Adds the columns needed to embed the Moesif metrics dashboard in the ICP UI:
--   components.moesif_workspace_id   - the Moesif workspace id backing the
--                                      "Metrics" dashboard; used in the embed URL
--                                      and to mint workspace access tokens.
--   components.moesif_dashboard_id   - the Moesif "Metrics" (child) dashboard id.
--   components.moesif_management_key - the Moesif Management API key used to mint
--                                      short-lived workspace access tokens on
--                                      demand (JWT-like token; can be long).
-- Idempotent - safe to re-run. Fresh installs get these from oracle_init.sql.
-- Run once against the main ICP DB (as the ICP schema owner).
--    (ORA-01430 = column being added already exists; ignored for idempotency)

DECLARE
    e_col_exists EXCEPTION;
    PRAGMA EXCEPTION_INIT(e_col_exists, -1430);
BEGIN
    EXECUTE IMMEDIATE 'ALTER TABLE components ADD (moesif_workspace_id VARCHAR2(512 CHAR) NULL)';
EXCEPTION
    WHEN e_col_exists THEN NULL;
END;
/

DECLARE
    e_col_exists EXCEPTION;
    PRAGMA EXCEPTION_INIT(e_col_exists, -1430);
BEGIN
    EXECUTE IMMEDIATE 'ALTER TABLE components ADD (moesif_dashboard_id VARCHAR2(512 CHAR) NULL)';
EXCEPTION
    WHEN e_col_exists THEN NULL;
END;
/

DECLARE
    e_col_exists EXCEPTION;
    PRAGMA EXCEPTION_INIT(e_col_exists, -1430);
BEGIN
    EXECUTE IMMEDIATE 'ALTER TABLE components ADD (moesif_management_key VARCHAR2(4000 CHAR) NULL)';
EXCEPTION
    WHEN e_col_exists THEN NULL;
END;
/
