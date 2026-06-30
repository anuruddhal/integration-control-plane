-- Migration: add runtimes.callback_url (workflow management service base URL from the heartbeat)
-- Engines: H2, MySQL/MariaDB, PostgreSQL, Microsoft SQL Server
--
-- This single statement is portable across all four supported engines:
--   * the `COLUMN` keyword is optional in H2/MySQL/PostgreSQL and unused in T-SQL,
--   * `VARCHAR(500)` is accepted everywhere.
-- Safe to run once on an existing v2 deployment whose `runtimes` table predates this column.
-- (Fresh installs already get the column from the *_init.sql scripts.)
--
-- Note: fresh MSSQL installs create this as NVARCHAR(500); for a callback URL (ASCII) the
-- VARCHAR(500) added here is equivalent. Adjust the type if strict consistency is required.

ALTER TABLE runtimes ADD callback_url VARCHAR(500);
