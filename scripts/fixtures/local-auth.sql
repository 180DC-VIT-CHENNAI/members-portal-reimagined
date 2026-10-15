-- Synthetic fixtures for isolated local D1 only, after runtime schema bootstrap.
-- Never execute this file against a remote database.
INSERT OR IGNORE INTO users (id, name, email, role_id, department_id) VALUES
('fixture-board', 'Synthetic Board', 'board@example.invalid', 'chairperson', 'tech'),
('fixture-director', 'Synthetic Director', 'director@example.invalid', 'finance_director', 'finance'),
('fixture-member', 'Synthetic Member', 'member@example.invalid', 'member', 'tech'),
('fixture-advisory', 'Synthetic Advisory', 'advisory@example.invalid', 'advisory', NULL),
('fixture-revoked', 'Synthetic Revoked', 'revoked@example.invalid', 'member', 'tech'),
('fixture-expired', 'Synthetic Expired', 'expired@example.invalid', 'member', 'tech');
INSERT OR IGNORE INTO admin_tokens (token, email, name, role_id, revoked_at, expires_at) VALUES
('synthetic-board-token', 'board@example.invalid', 'Synthetic Board', 'chairperson', NULL, NULL),
('synthetic-director-token', 'director@example.invalid', 'Synthetic Director', 'finance_director', NULL, NULL),
('synthetic-member-token', 'member@example.invalid', 'Synthetic Member', 'member', NULL, NULL),
('synthetic-advisory-token', 'advisory@example.invalid', 'Synthetic Advisory', 'advisory', NULL, NULL),
('synthetic-revoked-token', 'revoked@example.invalid', 'Synthetic Revoked', 'member', '2000-01-01 00:00:00', NULL),
('synthetic-expired-token', 'expired@example.invalid', 'Synthetic Expired', 'member', NULL, '2000-01-01 00:00:00');
