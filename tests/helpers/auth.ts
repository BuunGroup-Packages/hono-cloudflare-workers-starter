/**
 * Shared Auth Test Helpers
 *
 * Common utilities for authentication in tests.
 */

import { env } from "cloudflare:test";
import app from "../../src/index";

// Common headers for requests
export const headers = {
  "Content-Type": "application/json",
  Origin: "http://localhost",
};

// Type definitions
export type RegisterResponse = {
  id: string;
  email: string;
  message: string;
};

export type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: { id: string; email: string; role: string };
};

export type MeResponse = {
  id: string;
  email: string;
  role: string;
  created_at: string;
};

export type ErrorResponse = { error: string };
export type MessageResponse = { message: string };

/**
 * Generate unique email for each test
 */
export const uniqueEmail = () =>
  `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

/**
 * Register a new user and return credentials
 */
export async function registerUser(
  email?: string,
  password = "SecurePass123"
): Promise<{ email: string; password: string; id: string }> {
  const userEmail = email || uniqueEmail();

  const res = await app.request(
    "/api/auth/register",
    {
      method: "POST",
      headers,
      body: JSON.stringify({ email: userEmail, password }),
    },
    env
  );

  const data = (await res.json()) as RegisterResponse;
  return { email: userEmail, password, id: data.id };
}

/**
 * Register and login, return access token
 */
export async function getAuthToken(
  email?: string,
  password = "SecurePass123"
): Promise<string> {
  const userEmail = email || uniqueEmail();

  await app.request(
    "/api/auth/register",
    {
      method: "POST",
      headers,
      body: JSON.stringify({ email: userEmail, password }),
    },
    env
  );

  const loginRes = await app.request(
    "/api/auth/login",
    {
      method: "POST",
      headers,
      body: JSON.stringify({ email: userEmail, password }),
    },
    env
  );

  const data = (await loginRes.json()) as LoginResponse;
  return data.accessToken;
}

/**
 * Register and login, return full login response
 */
export async function getAuthTokens(
  email?: string,
  password = "SecurePass123"
): Promise<LoginResponse & { email: string; password: string }> {
  const userEmail = email || uniqueEmail();

  await app.request(
    "/api/auth/register",
    {
      method: "POST",
      headers,
      body: JSON.stringify({ email: userEmail, password }),
    },
    env
  );

  const loginRes = await app.request(
    "/api/auth/login",
    {
      method: "POST",
      headers,
      body: JSON.stringify({ email: userEmail, password }),
    },
    env
  );

  const data = (await loginRes.json()) as LoginResponse;
  return { ...data, email: userEmail, password };
}
