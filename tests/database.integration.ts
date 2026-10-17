import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { Session } from "@shopify/shopify-api";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "../app/db.server";
import { getOrCreateSettings } from "../app/services/settings.server";

// Use only an isolated test database. This suite creates and deletes its own
// uniquely named shop's rows; it never clears other shops or resets the schema.
const shop = `integration-${randomUUID()}.myshopify.com`;
const freshClient = new PrismaClient();

afterAll(async () => {
  try {
    await prisma.session.deleteMany({ where: { shop } });
    await prisma.productOptimizationLog.deleteMany({ where: { shop } });
    await prisma.picoSeoSettings.deleteMany({ where: { shop } });
  } finally {
    await Promise.all([prisma.$disconnect(), freshClient.$disconnect()]);
  }
});

describe("persistent PostgreSQL storage", () => {
  it("loads an offline Shopify session through a separate Prisma client", async () => {
    const storage = new PrismaSessionStorage(prisma);
    const session = new Session({
      id: `offline_${shop}`,
      shop,
      state: "",
      isOnline: false,
      accessToken: "integration-test-placeholder",
      scope: "read_products",
    });
    await storage.storeSession(session);
    const reloaded = await new PrismaSessionStorage(freshClient).loadSession(session.id);
    expect(reloaded?.shop).toBe(shop);
    expect(reloaded?.accessToken).toBe("integration-test-placeholder");
    expect(reloaded?.isActive("read_products")).toBe(true);
  });

  it("preserves settings and a stable IndexNow key across clients", async () => {
    const settings = await getOrCreateSettings(shop);
    expect(settings.indexNowApiKey).toMatch(/^[a-f0-9]{32}$/);
    await prisma.picoSeoSettings.update({
      where: { shop },
      data: { storeDisplayName: "Persistent store", autoSyncOnProductUpdate: true },
    });
    const reloaded = await freshClient.picoSeoSettings.findUniqueOrThrow({ where: { shop } });
    expect(reloaded.storeDisplayName).toBe("Persistent store");
    expect(reloaded.autoSyncOnProductUpdate).toBe(true);
    expect(reloaded.indexNowApiKey).toBe(settings.indexNowApiKey);
  });

  it("stores valid subscription states using the existing PostgreSQL enum", async () => {
    await prisma.picoSeoSettings.update({ where: { shop }, data: { subscriptionStatus: "TRIAL" } });
    expect((await freshClient.picoSeoSettings.findUniqueOrThrow({ where: { shop } })).subscriptionStatus).toBe("TRIAL");
  });

  it("persists optimization history and counters together", async () => {
    await prisma.$transaction([
      prisma.productOptimizationLog.create({
        data: { shop, productId: "gid://shopify/Product/1", productTitle: "Test product", seoScoreBefore: 50, seoScoreAfter: 90 },
      }),
      prisma.picoSeoSettings.update({ where: { shop }, data: { totalProductsOptimized: { increment: 1 } } }),
    ]);
    expect(await freshClient.productOptimizationLog.count({ where: { shop } })).toBe(1);
    expect((await freshClient.picoSeoSettings.findUniqueOrThrow({ where: { shop } })).totalProductsOptimized).toBe(1);
  });
});
