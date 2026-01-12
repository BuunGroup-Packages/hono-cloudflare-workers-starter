import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import type { AppEnv } from "../types/bindings";

/**
 * Audit Log Entry
 */
export interface AuditLogEntry {
  id: string;
  userId: string | null;
  action: string;
  resource: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

/**
 * Actions to audit
 */
export const AUDIT_ACTIONS = {
  // Auth actions
  LOGIN: "auth.login",
  LOGOUT: "auth.logout",
  LOGIN_FAILED: "auth.login_failed",
  TOKEN_REFRESH: "auth.token_refresh",
  PASSWORD_CHANGE: "auth.password_change",

  // Resource actions
  CREATE: "create",
  READ: "read",
  UPDATE: "update",
  DELETE: "delete",

  // Admin actions
  USER_CREATE: "admin.user_create",
  USER_UPDATE: "admin.user_update",
  USER_DELETE: "admin.user_delete",
  ROLE_CHANGE: "admin.role_change",
  API_KEY_CREATE: "admin.api_key_create",
  API_KEY_REVOKE: "admin.api_key_revoke",
} as const;

/**
 * Sensitive fields to redact from audit logs
 */
const SENSITIVE_FIELDS = [
  "password",
  "password_hash",
  "token",
  "refresh_token",
  "api_key",
  "secret",
  "authorization",
];

/**
 * Redact sensitive information from metadata
 */
function redactSensitiveData(
  data: Record<string, unknown>
): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();

    if (SENSITIVE_FIELDS.some((field) => lowerKey.includes(field))) {
      redacted[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      redacted[key] = redactSensitiveData(value as Record<string, unknown>);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Log an audit entry to D1 database
 *
 * Uses waitUntil for non-blocking async write when available.
 * Falls back to sync write in test environments.
 */
export async function logAudit(
  c: Context<AppEnv>,
  entry: Omit<AuditLogEntry, "id" | "createdAt">
): Promise<void> {
  const db = c.env.DB;
  const id = crypto.randomUUID();

  // Redact sensitive data from metadata
  const safeMetadata = entry.metadata
    ? redactSensitiveData(entry.metadata)
    : {};

  const insertPromise = db
    .prepare(
      `
      INSERT INTO audit_logs (id, user_id, action, resource, resource_id, ip_address, user_agent, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .bind(
      id,
      entry.userId,
      entry.action,
      entry.resource,
      entry.resourceId || null,
      entry.ipAddress || null,
      entry.userAgent || null,
      JSON.stringify(safeMetadata)
    )
    .run();

  // Use waitUntil for non-blocking write when available (production)
  // Falls back to sync write in test environments
  try {
    if (c.executionCtx?.waitUntil) {
      c.executionCtx.waitUntil(
        insertPromise.catch((error) => {
          console.error("Failed to write audit log:", error);
        })
      );
    } else {
      // In test environment, just fire and forget
      insertPromise.catch((error) => {
        console.error("Failed to write audit log:", error);
      });
    }
  } catch {
    // ExecutionContext not available - fire and forget
    insertPromise.catch((error) => {
      console.error("Failed to write audit log:", error);
    });
  }
}

/**
 * Get request metadata for audit logging
 */
export function getRequestMetadata(c: Context<AppEnv>) {
  return {
    ipAddress:
      c.req.header("CF-Connecting-IP") ||
      c.req.header("X-Forwarded-For")?.split(",")[0]?.trim(),
    userAgent: c.req.header("User-Agent"),
    method: c.req.method,
    path: c.req.path,
    query: Object.fromEntries(new URL(c.req.url).searchParams),
  };
}

/**
 * Audit Logger Middleware
 *
 * Automatically logs requests to specific routes.
 * Use for sensitive endpoints that need audit trails.
 *
 * Usage:
 *   app.use('/admin/*', auditLogger({ resource: 'admin' }))
 *   app.post('/posts', auditLogger({ resource: 'posts', action: 'create' }))
 */
export function auditLogger(options: {
  resource: string;
  action?: string;
  includeBody?: boolean;
}) {
  const { resource, action, includeBody = false } = options;

  return createMiddleware<AppEnv>(async (c, next) => {
    const startTime = Date.now();

    // Execute the request
    await next();

    // Determine action from HTTP method if not specified
    const methodAction =
      action ||
      {
        GET: AUDIT_ACTIONS.READ,
        POST: AUDIT_ACTIONS.CREATE,
        PUT: AUDIT_ACTIONS.UPDATE,
        PATCH: AUDIT_ACTIONS.UPDATE,
        DELETE: AUDIT_ACTIONS.DELETE,
      }[c.req.method] ||
      c.req.method.toLowerCase();

    // Build metadata
    const metadata: Record<string, unknown> = {
      ...getRequestMetadata(c),
      responseStatus: c.res.status,
      durationMs: Date.now() - startTime,
    };

    // Optionally include request body (redacted)
    if (includeBody && ["POST", "PUT", "PATCH"].includes(c.req.method)) {
      try {
        const body = await c.req.json();
        metadata.requestBody = redactSensitiveData(body);
      } catch {
        // Body not JSON or already consumed
      }
    }

    // Get resource ID from URL params
    const resourceId = c.req.param("id");

    // Log the audit entry
    await logAudit(c, {
      userId: c.get("userId") || null,
      action: methodAction,
      resource,
      resourceId,
      ipAddress: metadata.ipAddress as string,
      userAgent: metadata.userAgent as string,
      metadata,
    });
  });
}

/**
 * Create a manual audit log helper for use in route handlers
 *
 * Usage:
 *   const audit = createAuditLogger(c);
 *   await audit.log('user.created', 'users', userId, { email });
 */
export function createAuditLogger(c: Context<AppEnv>) {
  const requestMeta = getRequestMetadata(c);

  return {
    log: (
      action: string,
      resource: string,
      resourceId?: string,
      metadata?: Record<string, unknown>
    ) => {
      logAudit(c, {
        userId: c.get("userId") || null,
        action,
        resource,
        resourceId,
        ipAddress: requestMeta.ipAddress,
        userAgent: requestMeta.userAgent,
        metadata: {
          ...requestMeta,
          ...metadata,
        },
      });
    },
  };
}

/**
 * Query audit logs
 */
export async function queryAuditLogs(
  c: Context<AppEnv>,
  options: {
    userId?: string;
    resource?: string;
    action?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }
): Promise<AuditLogEntry[]> {
  let query = "SELECT * FROM audit_logs WHERE 1=1";
  const params: (string | number)[] = [];

  if (options.userId) {
    query += " AND user_id = ?";
    params.push(options.userId);
  }

  if (options.resource) {
    query += " AND resource = ?";
    params.push(options.resource);
  }

  if (options.action) {
    query += " AND action = ?";
    params.push(options.action);
  }

  if (options.startDate) {
    query += " AND created_at >= ?";
    params.push(options.startDate);
  }

  if (options.endDate) {
    query += " AND created_at <= ?";
    params.push(options.endDate);
  }

  query += " ORDER BY created_at DESC";
  query += ` LIMIT ? OFFSET ?`;
  params.push(options.limit || 100, options.offset || 0);

  const { results } = await c.env.DB.prepare(query).bind(...params).all();

  return (results || []).map((row) => ({
    id: row.id as string,
    userId: row.user_id as string | null,
    action: row.action as string,
    resource: row.resource as string,
    resourceId: row.resource_id as string | undefined,
    ipAddress: row.ip_address as string | undefined,
    userAgent: row.user_agent as string | undefined,
    metadata: JSON.parse((row.metadata as string) || "{}"),
    createdAt: row.created_at as string,
  }));
}
