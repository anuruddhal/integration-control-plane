-- Migration: add workflow_mgt workflow-execution permissions and map them to roles
-- Engines: H2, MySQL/MariaDB, PostgreSQL, Microsoft SQL Server
--
-- Adds the two workflow-execution permissions and grants them:
--   * Super Admin, Admin, Project Admin -> view + manage workflows
--   * Developer -> view workflows only (read-only Admin Actions)
-- Fixed permission_ids keep this portable. Fresh installs get these from the *_init.sql scripts.
-- Run once against the main ICP DB.
--
-- PREREQUISITE: run add_workflow_management_domain_<engine>.sql first so the
-- 'Workflow-Management' permission domain is allowed by the domain constraint.

INSERT INTO permissions (permission_id, permission_name, permission_domain, resource_type, action, description) VALUES
    ('a1f4c2e0-0000-4000-8000-000000000003', 'workflow_mgt:view_workflows', 'Workflow-Management', 'workflow', 'view', 'View workflow executions'),
    ('a1f4c2e0-0000-4000-8000-000000000004', 'workflow_mgt:manage_workflows', 'Workflow-Management', 'workflow', 'manage', 'Start, suspend, resume, cancel and terminate workflow executions');

INSERT INTO role_permission_mapping (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles_v2 r, permissions p
WHERE p.permission_name IN ('workflow_mgt:view_workflows', 'workflow_mgt:manage_workflows')
    AND (r.role_name IN ('Super Admin', 'Admin', 'Project Admin')
         OR (r.role_name = 'Developer' AND p.permission_name = 'workflow_mgt:view_workflows'));
