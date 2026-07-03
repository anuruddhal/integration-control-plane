-- Migration: add workflow_mgt human-task permissions and map them to roles
-- Engines: H2, MySQL/MariaDB, PostgreSQL, Microsoft SQL Server
--
-- Adds the two dedicated workflow permissions and grants them:
--   * Super Admin, Admin, Developer, Project Admin -> view + manage human tasks
--   * Viewer -> view human tasks only
-- Fixed permission_ids keep this portable (no per-engine UUID function needed) and
-- idempotent-friendly. Fresh installs get these from the *_init.sql scripts instead.
-- Run once against the main ICP DB.
--
-- PREREQUISITE: run add_workflow_management_domain_<engine>.sql first so the
-- 'Workflow-Management' permission domain is allowed by the domain constraint.

INSERT INTO permissions (permission_id, permission_name, permission_domain, resource_type, action, description) VALUES
    ('a1f4c2e0-0000-4000-8000-000000000001', 'workflow_mgt:view_human_tasks', 'Workflow-Management', 'human_task', 'view', 'View human tasks'),
    ('a1f4c2e0-0000-4000-8000-000000000002', 'workflow_mgt:manage_human_tasks', 'Workflow-Management', 'human_task', 'manage', 'Complete, fail and cancel human tasks');

INSERT INTO role_permission_mapping (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles_v2 r, permissions p
WHERE p.permission_name IN ('workflow_mgt:view_human_tasks', 'workflow_mgt:manage_human_tasks')
    AND (r.role_name IN ('Super Admin', 'Admin', 'Developer', 'Project Admin')
         OR (r.role_name = 'Viewer' AND p.permission_name = 'workflow_mgt:view_human_tasks'));
