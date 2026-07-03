-- Migration: allow the 'Workflow-Management' permission domain (H2)
-- Widens the domain CHECK constraint and re-files any existing workflow_mgt:* permissions
-- under the new domain. Run once against the main ICP DB (before the workflow permission
-- insert migrations on a DB that doesn't have them yet).

ALTER TABLE permissions DROP CONSTRAINT chk_permission_domain;
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

UPDATE permissions SET permission_domain = 'Workflow-Management' WHERE permission_name LIKE 'workflow_mgt:%';
