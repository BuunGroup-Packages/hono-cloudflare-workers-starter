/**
 * API Keys Tests
 */

import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import app from "../../../src/index";
import { headers, getAuthToken } from "../../helpers/auth";

// Type definitions
type ApiKeyResponse = {
  id: string;
  key: string;
  keyPrefix: string;
  name: string;
  scopes: string[];
  expiresAt: string | null;
  message: string;
};

type ApiKeyListResponse = {
  apiKeys: Array<{
    id: string;
    key_prefix: string;
    name: string;
    scopes: string[];
  }>;
  page: number;
  limit: number;
};

type MessageResponse = { message: string; id?: string };

describe("API Keys - Create", () => {
  it("POST /api/api-keys creates a new API key", async () => {
    const accessToken = await getAuthToken();

    const res = await app.request(
      "/api/api-keys",
      {
        method: "POST",
        headers: {
          ...headers,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name: "Test API Key",
          scopes: ["posts:read", "posts:create"],
        }),
      },
      env
    );

    expect(res.status).toBe(201);
    const data = (await res.json()) as ApiKeyResponse;
    expect(data.id).toBeDefined();
    expect(data.key).toBeDefined();
    expect(data.key).toMatch(/^sk_live_/);
    expect(data.name).toBe("Test API Key");
    expect(data.scopes).toContain("posts:read");
    expect(data.scopes).toContain("posts:create");
    expect(data.message).toContain("Store this API key securely");
  });

  it("POST /api/api-keys requires authentication", async () => {
    const res = await app.request(
      "/api/api-keys",
      {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "Test Key", scopes: ["posts:read"] }),
      },
      env
    );

    expect(res.status).toBe(401);
  });
});

describe("API Keys - List", () => {
  it("GET /api/api-keys lists user API keys", async () => {
    const accessToken = await getAuthToken();

    // Create a key first
    await app.request(
      "/api/api-keys",
      {
        method: "POST",
        headers: {
          ...headers,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name: "List Test Key",
          scopes: ["posts:read"],
        }),
      },
      env
    );

    // List keys
    const res = await app.request(
      "/api/api-keys",
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
    const data = (await res.json()) as ApiKeyListResponse;
    expect(data.apiKeys).toBeDefined();
    expect(data.apiKeys.length).toBeGreaterThanOrEqual(1);
    expect(data.page).toBe(1);
    expect(data.limit).toBe(20);

    // Keys should not expose the full key
    for (const key of data.apiKeys) {
      expect(key.key_prefix).toBeDefined();
      expect((key as unknown as { key?: string }).key).toBeUndefined();
    }
  });
});

describe("API Keys - Delete", () => {
  it("DELETE /api/api-keys/:id revokes the key", async () => {
    const accessToken = await getAuthToken();

    // Create a key
    const createRes = await app.request(
      "/api/api-keys",
      {
        method: "POST",
        headers: {
          ...headers,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ name: "Key to Delete", scopes: ["posts:read"] }),
      },
      env
    );

    const createData = (await createRes.json()) as ApiKeyResponse;
    const keyId = createData.id;

    // Delete the key
    const res = await app.request(
      `/api/api-keys/${keyId}`,
      {
        method: "DELETE",
        headers: {
          ...headers,
          Authorization: `Bearer ${accessToken}`,
        },
      },
      env
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as MessageResponse;
    expect(data.message).toBe("API key revoked");
    expect(data.id).toBe(keyId);
  });
});

describe("API Keys - Authentication", () => {
  it("API key can authenticate read requests", async () => {
    const accessToken = await getAuthToken();

    // Create an API key
    const createRes = await app.request(
      "/api/api-keys",
      {
        method: "POST",
        headers: {
          ...headers,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name: "Auth Test Key",
          scopes: ["posts:read"],
        }),
      },
      env
    );

    const createData = (await createRes.json()) as ApiKeyResponse;
    const apiKey = createData.key;

    // Use API key to read posts
    const res = await app.request(
      "/api/posts",
      {
        method: "GET",
        headers: {
          ...headers,
          "X-API-Key": apiKey,
        },
      },
      env
    );

    expect(res.status).toBe(200);
  });
});
