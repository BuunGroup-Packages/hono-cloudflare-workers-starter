/**
 * POST /api/auth/login Tests
 */

import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import app from "../../../src/index";
import {
  headers,
  uniqueEmail,
  registerUser,
  LoginResponse,
  ErrorResponse,
} from "../../helpers/auth";

describe("Auth - Login", () => {
  it("returns tokens for valid credentials", async () => {
    const { email, password } = await registerUser();

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

  it("rejects invalid password", async () => {
    const { email } = await registerUser();

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

  it("rejects non-existent user", async () => {
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
