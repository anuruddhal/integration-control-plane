-- Migration: workflow feature support (H2)
-- Adds everything an existing pre-workflow deployment needs for the workflow feature:
--   1. runtimes.callback_url        - workflow management service base URL from the heartbeat
--   2. 'Workflow-Management' domain - widens the permission_domain CHECK constraint
--   3. workflow_mgt:* permissions   - human-task and workflow-execution permissions
--   4. role grants                  - Super Admin/Admin/Project Admin: view + manage both;
--                                     Developer: manage human tasks, view workflows;
--                                     Viewer: view human tasks only
-- Idempotent - safe to re-run. Fresh installs get all of this from h2_init.sql.
-- Run once against the main ICP DB.

-- 1. Workflow management service base URL reported by the runtime heartbeat
ALTER TABLE runtimes ADD COLUMN IF NOT EXISTS callback_url VARCHAR(500);

-- 2. Allow the 'Workflow-Management' permission domain
ALTER TABLE permissions DROP CONSTRAINT IF EXISTS chk_permission_domain;
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

-- 3. Workflow permissions (fixed permission_ids keep this idempotent across engines)
INSERT INTO permissions (permission_id, permission_name, permission_domain, resource_type, action, description)
SELECT 'a1f4c2e0-0000-4000-8000-000000000001', 'workflow_mgt:view_human_tasks', 'Workflow-Management', 'human_task', 'view', 'View human tasks' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE permission_id = 'a1f4c2e0-0000-4000-8000-000000000001');

INSERT INTO permissions (permission_id, permission_name, permission_domain, resource_type, action, description)
SELECT 'a1f4c2e0-0000-4000-8000-000000000002', 'workflow_mgt:manage_human_tasks', 'Workflow-Management', 'human_task', 'manage', 'Complete, fail and cancel human tasks' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE permission_id = 'a1f4c2e0-0000-4000-8000-000000000002');

INSERT INTO permissions (permission_id, permission_name, permission_domain, resource_type, action, description)
SELECT 'a1f4c2e0-0000-4000-8000-000000000003', 'workflow_mgt:view_workflows', 'Workflow-Management', 'workflow', 'view', 'View workflow executions' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE permission_id = 'a1f4c2e0-0000-4000-8000-000000000003');

INSERT INTO permissions (permission_id, permission_name, permission_domain, resource_type, action, description)
SELECT 'a1f4c2e0-0000-4000-8000-000000000004', 'workflow_mgt:manage_workflows', 'Workflow-Management', 'workflow', 'manage', 'Start, suspend, resume, cancel and terminate workflow executions' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE permission_id = 'a1f4c2e0-0000-4000-8000-000000000004');

-- 4a. Human-task permission grants
INSERT INTO role_permission_mapping (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles_v2 r, permissions p
WHERE p.permission_name IN ('workflow_mgt:view_human_tasks', 'workflow_mgt:manage_human_tasks')
    AND (r.role_name IN ('Super Admin', 'Admin', 'Developer', 'Project Admin')
         OR (r.role_name = 'Viewer' AND p.permission_name = 'workflow_mgt:view_human_tasks'))
    AND NOT EXISTS (SELECT 1 FROM role_permission_mapping m
                    WHERE m.role_id = r.role_id AND m.permission_id = p.permission_id);

-- 4b. Workflow-execution permission grants
INSERT INTO role_permission_mapping (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles_v2 r, permissions p
WHERE p.permission_name IN ('workflow_mgt:view_workflows', 'workflow_mgt:manage_workflows')
    AND (r.role_name IN ('Super Admin', 'Admin', 'Project Admin')
         OR (r.role_name = 'Developer' AND p.permission_name = 'workflow_mgt:view_workflows'))
    AND NOT EXISTS (SELECT 1 FROM role_permission_mapping m
                    WHERE m.role_id = r.role_id AND m.permission_id = p.permission_id);
