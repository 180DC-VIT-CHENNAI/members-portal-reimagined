-- Shared club files (slice 2). Old rules: members (power >= 10, advisory
-- included) browse and download; leads (power >= 50) upload and delete.
INSERT OR IGNORE INTO `role_permissions` (`role_id`, `permission`, `scope`) VALUES ('admin', 'files.view', 'global'), ('admin', 'files.manage', 'global'), ('director', 'files.view', 'global'), ('director', 'files.manage', 'global'), ('member', 'files.view', 'global'), ('advisory', 'files.view', 'global');
