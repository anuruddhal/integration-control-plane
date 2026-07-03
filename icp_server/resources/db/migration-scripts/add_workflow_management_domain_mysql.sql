-- Migration: allow the 'Workflow-Management' permission domain (MySQL / MariaDB)
-- permission_domain is an ENUM, so widen it with MODIFY, then re-file any existing
-- workflow_mgt:* permissions under the new domain. Run once against the main ICP DB.

ALTER TABLE permissions MODIFY permission_domain ENUM(
    'Integration-Management',
    'Environment-Management',
    'Observability-Management',
    'Project-Management',
    'User-Management',
    'Workflow-Management'
) NOT NULL;

UPDATE permissions SET permission_domain = 'Workflow-Management' WHERE permission_name LIKE 'workflow_mgt:%';
