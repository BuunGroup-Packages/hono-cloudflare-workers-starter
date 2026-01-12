/**
 * POST /api/auth/register Tests
 */

import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import app from "../../../src/index";
import { headers, uniqueEmail, RegisterResponse } from "../../helpers/auth";

describe("Auth - Register", () => {
  it("creates a new user with valid data", async () => {
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

  it("rejects invalid email format", async () => {
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

  it("rejects weak password (too short)", async () => {
    const res = await app.request(
      "/api/auth/register",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          email: uniqueEmail(),
          password: "weak",
        }),
      },
      env
    );

    expect(res.status).toBe(400);
  });

  it("rejects password without uppercase", async () => {
    const res = await app.request(
      "/api/auth/register",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          email: uniqueEmail(),
          password: "securepass123",
        }),
      },
      env
    );

    expect(res.status).toBe(400);
  });

  it("rejects password without number", async () => {
    const res = await app.request(
      "/api/auth/register",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          email: uniqueEmail(),
          password: "SecurePass",
        }),
      },
      env
    );

    expect(res.status).toBe(400);
  });

  it("rejects duplicate email", async () => {
    const email = uniqueEmail();

    // Register first time
    await app.request(
      "/api/auth/register",
      {
        method: "POST",
        headers,
        body: JSON.stringify({ email, password: "SecurePass123" }),
      },
      env
    );

    // Try to register again with same email
    const res = await app.request(
      "/api/auth/register",
      {
        method: "POST",
        headers,
        body: JSON.stringify({ email, password: "SecurePass123" }),
      },
      env
    );

    expect(res.status).toBe(409);
  });
});
