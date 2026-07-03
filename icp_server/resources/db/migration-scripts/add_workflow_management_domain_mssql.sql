-- Migration: allow the 'Workflow-Management' permission domain (Microsoft SQL Server)
-- The domain CHECK is an inline, auto-named constraint, so look it up dynamically and drop it,
-- then re-add a named constraint and re-file existing workflow_mgt:* permissions.
-- Run once against the main ICP DB.

DECLARE @cn NVARCHAR(256);
SELECT @cn = name FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('permissions') AND definition LIKE '%permission_domain%';
IF @cn IS NOT NULL EXEC('ALTER TABLE permissions DROP CONSTRAINT ' + @cn);
GO

ALTER TABLE permissions ADD CONSTRAINT chk_permission_domain CHECK (
    permission_domain IN (
        'Integration-Management',
        'Environment-Management',
        'Observability-Management',
        'Project-Management',
        'User-Management',
        'Workflow-Management'
    )
);
GO

UPDATE permissions SET permission_domain = 'Workflow-Management' WHERE permission_name LIKE 'workflow_mgt:%';
GO
