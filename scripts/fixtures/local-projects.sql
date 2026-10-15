-- Isolated local D1 only. Apply after local-auth.sql and runtime bootstrap.
INSERT OR IGNORE INTO projects (id, name, status) VALUES
('fixture-project-tech', 'Synthetic Technical Project', 'upcoming'),
('fixture-project-finance', 'Synthetic Finance Project', 'upcoming'),
('fixture-project-explicit', 'Synthetic Assigned Project', 'upcoming');
INSERT OR IGNORE INTO project_departments (project_id, department_id) VALUES
('fixture-project-tech', 'tech'), ('fixture-project-finance', 'finance'), ('fixture-project-explicit', 'finance');
INSERT OR IGNORE INTO project_roles (id, project_id, user_id, role_name) VALUES
('fixture-advisory-project-role', 'fixture-project-explicit', 'fixture-advisory', 'Advisor'),
('fixture-member-project-role', 'fixture-project-explicit', 'fixture-member', 'Consultant');
INSERT OR IGNORE INTO project_tasks (id, project_id, title, assigned_to, status) VALUES
('fixture-task-tech', 'fixture-project-tech', 'Synthetic owned task', 'fixture-member', 'pending'),
('fixture-task-other', 'fixture-project-tech', 'Synthetic other task', 'fixture-board', 'pending'),
('fixture-task-finance', 'fixture-project-finance', 'Synthetic finance task', 'fixture-director', 'pending');
