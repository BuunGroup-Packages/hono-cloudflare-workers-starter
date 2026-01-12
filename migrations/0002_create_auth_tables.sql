-- Create users table for authentication
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Create refresh_tokens table for JWT token rotation
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  family_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT DEFAULT NULL
);

-- Create api_keys table for API key authentication
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_prefix TEXT NOT NULL,
  key_hash TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT '[]',
  rate_limit INTEGER DEFAULT 1000,
  last_used_at TEXT DEFAULT NULL,
  expires_at TEXT DEFAULT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT DEFAULT NULL
);

-- Create roles table for RBAC
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Create permissions table for RBAC
CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Create role_permissions junction table
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- Create audit_logs table for tracking actions
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata TEXT DEFAULT '{}',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource, resource_id);

-- Insert default roles
INSERT OR IGNORE INTO roles (id, name, description) VALUES
  ('role_admin', 'admin', 'Full administrative access'),
  ('role_editor', 'editor', 'Can create and edit content'),
  ('role_viewer', 'viewer', 'Read-only access');

-- Insert default permissions
INSERT OR IGNORE INTO permissions (id, name, resource, action) VALUES
  ('perm_posts_create', 'posts:create', 'posts', 'create'),
  ('perm_posts_read', 'posts:read', 'posts', 'read'),
  ('perm_posts_update', 'posts:update', 'posts', 'update'),
  ('perm_posts_delete', 'posts:delete', 'posts', 'delete'),
  ('perm_users_manage', 'users:manage', 'users', 'manage'),
  ('perm_api_keys_manage', 'api_keys:manage', 'api_keys', 'manage');

-- Assign permissions to roles
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES
  -- Admin gets all permissions
  ('role_admin', 'perm_posts_create'),
  ('role_admin', 'perm_posts_read'),
  ('role_admin', 'perm_posts_update'),
  ('role_admin', 'perm_posts_delete'),
  ('role_admin', 'perm_users_manage'),
  ('role_admin', 'perm_api_keys_manage'),
  -- Editor gets content permissions
  ('role_editor', 'perm_posts_create'),
  ('role_editor', 'perm_posts_read'),
  ('role_editor', 'perm_posts_update'),
  ('role_editor', 'perm_posts_delete'),
  -- Viewer gets read-only
  ('role_viewer', 'perm_posts_read');
