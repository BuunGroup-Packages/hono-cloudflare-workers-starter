import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../types/bindings";

/**
 * Role Hierarchy
 *
 * Defines which roles inherit permissions from others.
 * Admin inherits all, editor inherits from viewer, etc.
 */
export const ROLE_HIERARCHY: Record<string, string[]> = {
  admin: ["editor", "viewer", "user"],
  editor: ["viewer", "user"],
  viewer: ["user"],
  user: [],
};

/**
 * Check if a role has permission (including inherited roles)
 */
export function roleHasPermission(
  userRole: string,
  requiredRole: string
): boolean {
  if (userRole === requiredRole) return true;

  const inherited = ROLE_HIERARCHY[userRole] || [];
  return inherited.includes(requiredRole);
}

/**
 * Require Role Middleware
 *
 * Restricts access to users with specific roles.
 * Supports role hierarchy - admin can access editor routes.
 *
 * Usage:
 *   app.use('/admin/*', requireRole('admin'))
 *   app.use('/posts/*', requireRole('editor'))
 */
export function requireRole(role: string | string[]) {
  const roles = Array.isArray(role) ? role : [role];

  return createMiddleware<AppEnv>(async (c, next) => {
    const userRole = c.get("userRole");

    if (!userRole) {
      throw new HTTPException(401, {
        message: "Authentication required",
      });
    }

    const hasRole = roles.some((r) => roleHasPermission(userRole, r));

    if (!hasRole) {
      throw new HTTPException(403, {
        message: `Access denied. Required role: ${roles.join(" or ")}`,
      });
    }

    await next();
  });
}

/**
 * Require Permission Middleware
 *
 * Restricts access based on specific permissions from the database.
 * More granular than role-based checks.
 *
 * Usage:
 *   app.post('/posts', requirePermission('posts:create'))
 *   app.delete('/users/:id', requirePermission('users:manage'))
 */
export function requirePermission(permission: string | string[]) {
  const permissions = Array.isArray(permission) ? permission : [permission];

  return createMiddleware<AppEnv>(async (c, next) => {
    const userId = c.get("userId");
    const userRole = c.get("userRole");

    if (!userId || !userRole) {
      throw new HTTPException(401, {
        message: "Authentication required",
      });
    }

    // Check API key scopes if authenticated via API key
    const apiKeyScopes = c.get("apiKeyScopes") as string[] | undefined;
    if (apiKeyScopes) {
      const hasScope = permissions.every((p) => apiKeyScopes.includes(p));
      if (hasScope) {
        await next();
        return;
      }
    }

    // Query user permissions from database
    const { results } = await c.env.DB.prepare(
      `
      SELECT DISTINCT p.name
      FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      JOIN roles r ON rp.role_id = r.id
      WHERE r.name = ?
    `
    )
      .bind(userRole)
      .all();

    const userPermissions = (results || []).map((r) => r.name as string);

    const hasPermission = permissions.every((p) => userPermissions.includes(p));

    if (!hasPermission) {
      throw new HTTPException(403, {
        message: `Access denied. Required permission: ${permissions.join(", ")}`,
      });
    }

    await next();
  });
}

/**
 * Resource Owner Middleware
 *
 * Ensures users can only access their own resources.
 * Admin role bypasses this check.
 *
 * Usage:
 *   app.put('/users/:id', resourceOwner('id'))
 */
export function resourceOwner(paramName: string = "id") {
  return createMiddleware<AppEnv>(async (c, next) => {
    const userId = c.get("userId");
    const userRole = c.get("userRole");
    const resourceId = c.req.param(paramName);

    if (!userId) {
      throw new HTTPException(401, {
        message: "Authentication required",
      });
    }

    // Admins can access any resource
    if (userRole === "admin") {
      await next();
      return;
    }

    // Check ownership
    if (resourceId !== userId) {
      throw new HTTPException(403, {
        message: "Access denied. You can only access your own resources.",
      });
    }

    await next();
  });
}

/**
 * Conditional Permission Middleware
 *
 * Applies different permission checks based on request method.
 * Useful for RESTful endpoints with mixed access.
 *
 * Usage:
 *   app.use('/posts/:id', conditionalPermission({
 *     GET: 'posts:read',
 *     PUT: 'posts:update',
 *     DELETE: 'posts:delete'
 *   }))
 */
export function conditionalPermission(
  methodPermissions: Record<string, string>
) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const method = c.req.method.toUpperCase();
    const permission = methodPermissions[method];

    if (!permission) {
      // No permission required for this method
      await next();
      return;
    }

    // Apply permission check
    const permissionMiddleware = requirePermission(permission);
    return permissionMiddleware(c, next);
  });
}

/**
 * Admin Only Middleware
 *
 * Shorthand for requireRole('admin')
 */
export const adminOnly = () => requireRole("admin");

/**
 * Editor or Above Middleware
 *
 * Shorthand for requireRole(['admin', 'editor'])
 */
export const editorOrAbove = () => requireRole(["admin", "editor"]);
