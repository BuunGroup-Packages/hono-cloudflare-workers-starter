import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import app from "../src/index";

// Type definitions for API responses
type RegisterResponse = { id: string; email: string; message: string };
type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: { id: string; email: string; role: string };
};
type MeResponse = { id: string; email: string; role: string; created_at: string };
type ErrorResponse = { error: string };
type MessageResponse = { message: string };

// Common headers for requests (bypass CSRF with Origin)
const headers = {
  "Content-Type": "application/json",
  Origin: "http://localhost",
};

// Helper to generate unique email for each test
const uniqueEmail = () =>
  `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

describe("Auth - Registration", () => {
  it("POST /api/auth/register creates a new user", async () => {
    const email = uniqueEmail();
    const res = await app.request(
      "/api/auth/register",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          email,
          password: "SecurePass123",
        }),
      },
      env
    );

    expect(res.status).toBe(201);
    const data = (await res.json()) as RegisterResponse;
    expect(data.email).toBe(email);
    expect(data.id).toBeDefined();
    expect(data.message).toBe("User created successfully");
  });

  it("POST /api/auth/register validates email format", async () => {
    const res = await app.request(
      "/api/auth/register",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          email: "not-an-email",
          password: "SecurePass123",
        }),
      },
      env
    );

    expect(res.status).toBe(400);
  });

  it("POST /api/auth/register validates password requirements", async () => {
    const res = await app.request(
      "/api/auth/register",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          email: uniqueEmail(),
          password: "weak", // Too short, no uppercase, no number
        }),
      },
      env
    );

    expect(res.status).toBe(400);
  });
});

describe("Auth - Login", () => {
  it("POST /api/auth/login returns tokens for valid credentials", async () => {
    const email = uniqueEmail();
    const password = "SecurePass123";

    // Register first
    await app.request(
      "/api/auth/register",
      {
        method: "POST",
        headers,
        body: JSON.stringify({ email, password }),
      },
      env
    );

    // Then login
    const res = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers,
        body: JSON.stringify({ email, password }),
      },
      env
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as LoginResponse;
    expect(data.accessToken).toBeDefined();
    expect(data.refreshToken).toBeDefined();
    expect(data.tokenType).toBe("Bearer");
    expect(data.expiresIn).toBe(900);
    expect(data.user.email).toBe(email);
    expect(data.user.role).toBe("user");
  });

  it("POST /api/auth/login rejects invalid password", async () => {
    const email = uniqueEmail();

    // Register
    await app.request(
      "/api/auth/register",
      {
        method: "POST",
        headers,
        body: JSON.stringify({ email, password: "SecurePass123" }),
      },
      env
    );

    // Login with wrong password
    const res = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers,
        body: JSON.stringify({ email, password: "WrongPassword123" }),
      },
      env
    );

    expect(res.status).toBe(401);
    const data = (await res.json()) as ErrorResponse;
    expect(data.error).toBe("Invalid credentials");
  });

  it("POST /api/auth/login rejects non-existent user", async () => {
    const res = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          email: "nonexistent@example.com",
          password: "AnyPassword123",
        }),
      },
      env
    );

    expect(res.status).toBe(401);
    const data = (await res.json()) as ErrorResponse;
    expect(data.error).toBe("Invalid credentials");
  });
});

describe("Auth - Protected Routes", () => {
  it("GET /api/auth/me returns user info with valid token", async () => {
    const email = uniqueEmail();
    const password = "SecurePass123";

    // Register
    await app.request(
      "/api/auth/register",
      {
        method: "POST",
        headers,
        body: JSON.stringify({ email, password }),
      },
      env
    );

    // Login
    const loginRes = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers,
        body: JSON.stringify({ email, password }),
      },
      env
    );
    const loginData = (await loginRes.json()) as LoginResponse;

    // Get me
    const res = await app.request(
      "/api/auth/me",
      {
        method: "GET",
        headers: {
          ...headers,
          Authorization: `Bearer ${loginData.accessToken}`,
        },
      },
      env
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as MeResponse;
    expect(data.email).toBe(email);
    expect(data.role).toBe("user");
    expect(data.id).toBeDefined();
  });

  it("GET /api/auth/me rejects missing token", async () => {
    const res = await app.request(
      "/api/auth/me",
      { method: "GET", headers },
      env
    );

    expect(res.status).toBe(401);
  });

  it("GET /api/auth/me rejects invalid token", async () => {
    const res = await app.request(
      "/api/auth/me",
      {
        method: "GET",
        headers: {
          ...headers,
          Authorization: "Bearer invalid-token",
        },
      },
      env
    );

    expect(res.status).toBe(401);
  });

  it("POST /api/auth/logout revokes tokens", async () => {
    const email = uniqueEmail();
    const password = "SecurePass123";

    // Register and login
    await app.request(
      "/api/auth/register",
      {
        method: "POST",
        headers,
        body: JSON.stringify({ email, password }),
      },
      env
    );

    const loginRes = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers,
        body: JSON.stringify({ email, password }),
      },
      env
    );
    const loginData = (await loginRes.json()) as LoginResponse;

    // Logout
    const res = await app.request(
      "/api/auth/logout",
      {
        method: "POST",
        headers: {
          ...headers,
          Authorization: `Bearer ${loginData.accessToken}`,
        },
      },
      env
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as MessageResponse;
    expect(data.message).toBe("Logged out successfully");
  });
});
