import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@shopify/shopify-app-remix/adapters/node";
import { LogSeverity, shopifyApp } from "@shopify/shopify-app-remix/server";
import { shopifyLogger } from "../app/lib/shopify-logger.server";

afterEach(() => vi.restoreAllMocks());

describe("safe Shopify authentication diagnostics", () => {
  it.each([
    ["Session token had invalid API key", "client_id_mismatch"],
    ["Failed to parse session token 'PRIVATE_TOKEN': signature verification failed", "signature_mismatch"],
    ['Failed to parse session token \'PRIVATE_TOKEN\': "exp" claim timestamp check failed', "token_expired"],
    ['Failed to parse session token \'PRIVATE_TOKEN\': "nbf" claim timestamp check failed', "token_not_yet_valid"],
    ["Unexpected PRIVATE_ERROR", "invalid_session_token"],
  ])("reports only a fixed reason for %s", (error, reason) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    shopifyLogger.log(
      LogSeverity.Debug,
      `[shopify-app/DEBUG] Failed to validate session token: ${error} | {shop: PRIVATE_SHOP}`,
    );
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      `[PicoSEO/auth] session_token_rejected reason=${reason}`,
    );
  });

  it("discards token and payload debug messages", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    shopifyLogger.log(LogSeverity.Debug, '[shopify-app/DEBUG] Attempting to authenticate session token | {sessionToken: PRIVATE_TOKEN}');
    shopifyLogger.log(LogSeverity.Debug, '[shopify-app/DEBUG] Session token is valid - validated | {payload: PRIVATE_PAYLOAD}');
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong-secret", "client-id", "signature_mismatch"],
    ["test-secret", "wrong-client-id", "client_id_mismatch"],
  ])("diagnoses real SDK rejection without leaking JWTs (%s, %s)", async (secret, audience, reason) => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = {
      loadSession: vi.fn(),
      storeSession: vi.fn(),
      deleteSession: vi.fn(),
      deleteSessions: vi.fn(),
      findSessionsByShop: vi.fn(),
    };
    const app = shopifyApp({
      apiKey: "client-id",
      apiSecretKey: "test-secret",
      appUrl: "https://example.com",
      sessionStorage: storage,
      logger: shopifyLogger,
      future: { unstable_newEmbeddedAuthStrategy: true },
    });
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      aud: audience, dest: "https://test.myshopify.com", sub: "123",
      exp: now + 60, nbf: now - 10, iat: now,
    })).toString("base64url");
    const unsigned = `${header}.${payload}`;
    const token = `${unsigned}.${createHmac("sha256", secret).update(unsigned).digest("base64url")}`;
    const request = new Request("https://example.com/app", {
      headers: {
        authorization: `Bearer ${token}`,
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      },
    });

    await expect(app.authenticate.admin(request)).rejects.toMatchObject({ status: 401 });
    expect(warn).toHaveBeenCalledWith(`[PicoSEO/auth] session_token_rejected reason=${reason}`);
    expect(storage.loadSession).not.toHaveBeenCalled();
    expect(JSON.stringify([...log.mock.calls, ...warn.mock.calls])).not.toContain(token);
    expect(JSON.stringify([...log.mock.calls, ...warn.mock.calls])).not.toContain(payload);
  });
});
