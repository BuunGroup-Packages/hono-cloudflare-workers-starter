/**
 * GET /api/auth/me Tests
 */

import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import app from "../../../src/index";
import { headers, getAuthTokens, MeResponse } from "../../helpers/auth";

describe("Auth - Me", () => {
  it("returns user info with valid token", async () => {
    const { accessToken, email } = await getAuthTokens();

    const res = await app.request(
      "/api/auth/me",
      {
        method: "GET",
        headers: {
          ...headers,
          Authorization: `Bearer ${accessToken}`,
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

  it("rejects missing token", async () => {
    const res = await app.request(
      "/api/auth/me",
      { method: "GET", headers },
      env
    );

    expect(res.status).toBe(401);
  });

  it("rejects invalid token", async () => {
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
});
