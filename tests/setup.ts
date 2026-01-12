import { env } from "cloudflare:test";
import { beforeAll } from "vitest";

// Create all tables before running tests
beforeAll(async () => {
  // Posts table
  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, published INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);"
  );

  // Users table
  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);"
  );

  // Refresh tokens table
  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS refresh_tokens (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, family_id TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, revoked_at TEXT DEFAULT NULL);"
  );

  // API keys table
  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS api_keys (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, key_prefix TEXT NOT NULL, key_hash TEXT UNIQUE NOT NULL, name TEXT NOT NULL, scopes TEXT NOT NULL DEFAULT '[]', rate_limit INTEGER DEFAULT 1000, last_used_at TEXT DEFAULT NULL, expires_at TEXT DEFAULT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, revoked_at TEXT DEFAULT NULL);"
  );

  // Roles table
  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS roles (id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, description TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);"
  );

  // Permissions table
  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS permissions (id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, resource TEXT NOT NULL, action TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);"
  );

  // Role permissions junction table
  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS role_permissions (role_id TEXT NOT NULL, permission_id TEXT NOT NULL, PRIMARY KEY (role_id, permission_id));"
  );

  // Audit logs table
  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, user_id TEXT, action TEXT NOT NULL, resource TEXT NOT NULL, resource_id TEXT, ip_address TEXT, user_agent TEXT, metadata TEXT DEFAULT '{}', created_at TEXT DEFAULT CURRENT_TIMESTAMP);"
  );

  // Seed default roles
  await env.DB.exec(
    "INSERT OR IGNORE INTO roles (id, name, description) VALUES ('role_admin', 'admin', 'Full administrative access');"
  );
  await env.DB.exec(
    "INSERT OR IGNORE INTO roles (id, name, description) VALUES ('role_editor', 'editor', 'Can create and edit content');"
  );
  await env.DB.exec(
    "INSERT OR IGNORE INTO roles (id, name, description) VALUES ('role_viewer', 'viewer', 'Read-only access');"
  );

  // Seed default permissions
  await env.DB.exec(
    "INSERT OR IGNORE INTO permissions (id, name, resource, action) VALUES ('perm_posts_create', 'posts:create', 'posts', 'create');"
  );
  await env.DB.exec(
    "INSERT OR IGNORE INTO permissions (id, name, resource, action) VALUES ('perm_posts_read', 'posts:read', 'posts', 'read');"
  );
  await env.DB.exec(
    "INSERT OR IGNORE INTO permissions (id, name, resource, action) VALUES ('perm_posts_update', 'posts:update', 'posts', 'update');"
  );
  await env.DB.exec(
    "INSERT OR IGNORE INTO permissions (id, name, resource, action) VALUES ('perm_posts_delete', 'posts:delete', 'posts', 'delete');"
  );
  await env.DB.exec(
    "INSERT OR IGNORE INTO permissions (id, name, resource, action) VALUES ('perm_users_manage', 'users:manage', 'users', 'manage');"
  );
  await env.DB.exec(
    "INSERT OR IGNORE INTO permissions (id, name, resource, action) VALUES ('perm_api_keys_manage', 'api_keys:manage', 'api_keys', 'manage');"
  );

  // Assign permissions to admin role
  await env.DB.exec(
    "INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('role_admin', 'perm_posts_create');"
  );
  await env.DB.exec(
    "INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('role_admin', 'perm_posts_read');"
  );
  await env.DB.exec(
    "INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('role_admin', 'perm_posts_update');"
  );
  await env.DB.exec(
    "INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('role_admin', 'perm_posts_delete');"
  );
  await env.DB.exec(
    "INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('role_admin', 'perm_users_manage');"
  );
  await env.DB.exec(
    "INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('role_admin', 'perm_api_keys_manage');"
  );

  // Assign permissions to editor role
  await env.DB.exec(
    "INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('role_editor', 'perm_posts_create');"
  );
  await env.DB.exec(
    "INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('role_editor', 'perm_posts_read');"
  );
  await env.DB.exec(
    "INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('role_editor', 'perm_posts_update');"
  );
  await env.DB.exec(
    "INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('role_editor', 'perm_posts_delete');"
  );

  // Assign permissions to viewer role
  await env.DB.exec(
    "INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ('role_viewer', 'perm_posts_read');"
  );
});
