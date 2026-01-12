/**
 * Middleware Barrel Export
 *
 * Re-exports all middleware for convenient imports.
 */

export { errorHandler, notFoundHandler } from "./error-handler";

// Authentication
export {
  jwtAuth,
  optionalJwtAuth,
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  JWT_CONFIG,
  type JWTPayload,
} from "./jwt-auth";

export {
  apiKeyAuth,
  combinedAuth,
  generateApiKey,
  hashApiKey,
  extractKeyPrefix,
  API_KEY_PREFIX,
} from "./api-key-auth";

// Rate Limiting
export {
  rateLimiter,
  kvRateLimiter,
  strictRateLimiter,
  writeRateLimiter,
  RATE_LIMIT_CONFIG,
} from "./rate-limiter";

// Authorization (RBAC)
export {
  requireRole,
  requirePermission,
  resourceOwner,
  conditionalPermission,
  adminOnly,
  editorOrAbove,
  roleHasPermission,
  ROLE_HIERARCHY,
} from "./rbac";

// Audit Logging
export {
  auditLogger,
  logAudit,
  createAuditLogger,
  queryAuditLogs,
  getRequestMetadata,
  AUDIT_ACTIONS,
  type AuditLogEntry,
} from "./audit-logger";
