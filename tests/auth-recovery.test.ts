import { describe, expect, it } from "vitest";
import { authRecoveryPath } from "../app/lib/auth-recovery";

describe("session recovery", () => {
  it("preserves embedding context but removes stale credentials and data parameters", () => {
    const path = authRecoveryPath("/app/settings", "?shop=test.myshopify.com&host=encoded&embedded=1&id_token=expired&session=secret&hmac=signature&_data=routes/app&shopify-reload=https://evil.test");
    expect(path).toBe("/app/settings?shop=test.myshopify.com&host=encoded&embedded=1");
  });

  it("offers login when launch context is missing", () => {
    expect(authRecoveryPath("/app", "?id_token=expired")).toBe("/auth/login");
  });

  it("never produces an external redirect", () => {
    expect(authRecoveryPath("//evil.test/app", "?shop=test.myshopify.com"))
      .toBe("/app?shop=test.myshopify.com");
  });
});
