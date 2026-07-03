-- Migration: allow the 'Workflow-Management' permission domain (PostgreSQL)
-- The domain CHECK is an inline (auto-named) constraint: permissions_permission_domain_check.
-- Drop and re-add it with the new value, then re-file existing workflow_mgt:* permissions.
-- Run once against the main ICP DB.

ALTER TABLE permissions DROP CONSTRAINT IF EXISTS permissions_permission_domain_check;
ALTER TABLE permissions ADD CONSTRAINT permissions_permission_domain_check CHECK (
    permission_domain IN (
        'Integration-Management',
        'Environment-Management',
        'Observability-Management',
        'Project-Management',
        'User-Management',
        'Workflow-Management'
    )
);

UPDATE permissions SET permission_domain = 'Workflow-Management' WHERE permission_name LIKE 'workflow_mgt:%';
