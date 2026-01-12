/**
 * POST /api/auth/logout Tests
 */

import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import app from "../../../src/index";
import { headers, getAuthTokens, MessageResponse } from "../../helpers/auth";

describe("Auth - Logout", () => {
  it("revokes tokens successfully", async () => {
    const { accessToken } = await getAuthTokens();

    const res = await app.request(
      "/api/auth/logout",
      {
        method: "POST",
        headers: {
          ...headers,
          Authorization: `Bearer ${accessToken}`,
        },
      },
      env
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as MessageResponse;
    expect(data.message).toBe("Logged out successfully");
  });

  it("requires authentication", async () => {
    const res = await app.request(
      "/api/auth/logout",
      {
        method: "POST",
        headers,
      },
      env
    );

    expect(res.status).toBe(401);
  });
});
