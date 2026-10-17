import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
}));
vi.mock("../app/db.server", () => ({
  default: { picoSeoSettings: database },
}));

import { defaultSettings, ensureStoreInfrastructure, getOrCreateSettings } from "../app/services/settings.server";
import { getThemeEmbedInfo } from "../app/services/theme.server";
import { syncSubscriptionStatus } from "../app/services/billing.server";

beforeEach(() => {
  vi.clearAllMocks();
  database.findUnique.mockResolvedValue(null);
});

describe("service fallbacks must not swallow authentication", () => {
  it("does not manufacture an active subscription or ownership key when storage fails", () => {
    const settings = defaultSettings("test.myshopify.com");
    expect(settings.subscriptionStatus).toBe("INACTIVE");
    expect(settings.indexNowApiKey).toBeNull();
  });

  it("passes reauthentication through both nested settings catch blocks", async () => {
    const response = new Response(null, { status: 401 });
    const admin = { graphql: vi.fn().mockRejectedValue(response) };
    await expect(getOrCreateSettings("test.myshopify.com", admin)).rejects.toBe(response);
    expect(database.upsert).not.toHaveBeenCalled();
  });

  it("passes reauthentication out of best-effort infrastructure setup", async () => {
    const response = new Response(null, { status: 302, headers: { Location: "/auth/session-token" } });
    const admin = { graphql: vi.fn().mockRejectedValue(response) };
    await expect(ensureStoreInfrastructure(admin, defaultSettings("test.myshopify.com"))).rejects.toBe(response);
  });

  it("does not use theme fallback data instead of refreshing the session", async () => {
    const response = new Response(null, { status: 401 });
    const admin = { graphql: vi.fn().mockRejectedValue(response) };
    await expect(getThemeEmbedInfo(admin, "test.myshopify.com")).rejects.toBe(response);
  });

  it("does not use cached billing status instead of refreshing the session", async () => {
    const response = new Response(null, { status: 401 });
    const admin = { graphql: vi.fn().mockRejectedValue(response) };
    await expect(syncSubscriptionStatus(admin, "test.myshopify.com")).rejects.toBe(response);
    expect(database.findUnique).not.toHaveBeenCalled();
  });
});
