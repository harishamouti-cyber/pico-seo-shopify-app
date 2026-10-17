import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TEMPLATES } from "../app/lib/seo-template";

const mocks = vi.hoisted(() => ({
  settings: vi.fn(),
  shopInfo: vi.fn(),
  transaction: vi.fn(),
  createLog: vi.fn(),
  updateSettings: vi.fn(),
  ping: vi.fn(),
}));

vi.mock("../app/db.server", () => ({
  default: {
    productOptimizationLog: { findMany: vi.fn().mockResolvedValue([]), create: mocks.createLog },
    picoSeoSettings: { update: mocks.updateSettings },
    $transaction: mocks.transaction,
  },
}));
vi.mock("../app/services/settings.server", () => ({
  getOrCreateSettings: mocks.settings,
  fetchShopInfo: mocks.shopInfo,
  defaultSettings: vi.fn(),
  toStoreContext: () => ({ storeName: "Pico", shopDomain: "test.myshopify.com", host: "test.example", currencyCode: "USD" }),
}));
vi.mock("../app/services/indexnow.server", () => ({ pingIndexNow: mocks.ping }));

import { fetchCatalogAudit, optimizeCatalogBulk, optimizeSingleProduct } from "../app/services/catalog-seo.server";

function rawProduct(missingAlt = false) {
  return {
    id: "gid://shopify/Product/1", title: "Trail hiking boots", handle: "trail-boots", status: "ACTIVE",
    vendor: "Pico", productType: "Boots", tags: ["hiking"], description: "Comfortable hiking boots. ".repeat(8),
    seo: { title: "Trail hiking boots | Pico", description: "Comfortable hiking boots for long trails with durable soles and premium materials. Shop the collection at Pico." },
    media: { nodes: [{ id: "gid://shopify/MediaImage/1", mediaContentType: "IMAGE", alt: missingAlt ? "" : "Brown trail hiking boots", image: { url: "https://cdn.example/boots.jpg" } }] },
    variants: { nodes: [] },
  };
}

function adminFor(product = rawProduct()) {
  return {
    graphql: vi.fn(async (query: string) => {
      if (query.includes("PicoCatalogProducts")) return Response.json({ data: { products: { nodes: [product] } } });
      if (query.includes("PicoSingleProduct")) return Response.json({ data: { product } });
      if (query.includes("fileUpdate")) return Response.json({ data: { fileUpdate: { userErrors: [] } } });
      return Response.json({ data: { productUpdate: { userErrors: [] } } });
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.settings.mockResolvedValue({ ...DEFAULT_TEMPLATES, enableIndexNowPing: true, indexNowApiKey: "test-key" });
  mocks.shopInfo.mockResolvedValue({ name: "Pico", myshopifyDomain: "test.myshopify.com", currencyCode: "USD", primaryDomain: { host: "test.example" } });
  mocks.ping.mockResolvedValue({ ok: true });
  mocks.transaction.mockResolvedValue([]);
});

describe("catalog correctness and auth propagation", () => {
  it("leaves healthy products untouched when bulk optimization has no targets", async () => {
    const admin = adminFor();
    const summary = await optimizeCatalogBulk(admin, "test.myshopify.com");
    expect(summary.optimizedCount).toBe(0);
    expect(summary.failedCount).toBe(0);
    expect(admin.graphql).toHaveBeenCalledTimes(1);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.ping).not.toHaveBeenCalled();
  });

  it("does not turn a failed catalog query into an empty perfect-score audit", async () => {
    const admin = { graphql: vi.fn().mockRejectedValue(new Error("Catalog unavailable")) };
    await expect(fetchCatalogAudit(admin, "test.myshopify.com")).rejects.toThrow("Catalog unavailable");
  });

  it("propagates Shopify refresh responses out of the audit", async () => {
    const response = new Response(null, { status: 401, headers: { "X-Shopify-Retry-Invalid-Session-Request": "1" } });
    const admin = { graphql: vi.fn().mockRejectedValue(response) };
    await expect(fetchCatalogAudit(admin, "test.myshopify.com")).rejects.toBe(response);
  });

  it("does not swallow refresh responses while loading settings or store info", async () => {
    const response = new Response(null, { status: 302, headers: { Location: "/auth/session-token" } });
    mocks.settings.mockRejectedValueOnce(response);
    await expect(fetchCatalogAudit(adminFor(), "test.myshopify.com")).rejects.toBe(response);
    mocks.shopInfo.mockRejectedValueOnce(response);
    await expect(fetchCatalogAudit(adminFor(), "test.myshopify.com")).rejects.toBe(response);
  });

  it("reports rejected alt-text writes instead of recording a fictitious score", async () => {
    const admin = adminFor(rawProduct(true));
    admin.graphql.mockImplementation(async (query) => Response.json({
      data: query.includes("PicoSingleProduct")
        ? { product: rawProduct(true) }
        : { fileUpdate: { userErrors: [{ message: "File access denied" }] } },
    }));
    await expect(optimizeSingleProduct(admin, "test.myshopify.com", "gid://shopify/Product/1"))
      .rejects.toThrow("File access denied");
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.ping).not.toHaveBeenCalled();
  });

  it("runs IndexNow after a successful repair and records the result", async () => {
    const result = await optimizeSingleProduct(adminFor(rawProduct(true)), "test.myshopify.com", "gid://shopify/Product/1");
    expect(result.altTextsUpdatedCount).toBe(1);
    expect(result.indexNowPinged).toBe(true);
    expect(result.seoScoreAfter).toBeGreaterThan(result.seoScoreBefore);
    expect(mocks.ping).toHaveBeenCalledWith("test.example", "test-key", ["https://test.example/products/trail-boots"]);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("preserves existing custom metadata while repairing alt text", async () => {
    const admin = adminFor(rawProduct(true));
    const result = await optimizeSingleProduct(admin, "test.myshopify.com", "gid://shopify/Product/1");
    expect(result.metaUpdated).toBe(false);
    expect(result.resolvedTitle).toBe(rawProduct().seo.title);
    expect(admin.graphql.mock.calls.some(([query]) => query.includes("productUpdate"))).toBe(false);
  });

  it("still supports explicitly overwriting healthy products", async () => {
    const admin = adminFor();
    const summary = await optimizeCatalogBulk(admin, "test.myshopify.com", { forceOverwriteAll: true });
    expect(summary.optimizedCount).toBe(1);
    expect(summary.results[0].metaUpdated).toBe(true);
    expect(admin.graphql.mock.calls.some(([query]) => query.includes("productUpdate"))).toBe(true);
  });

  it("surfaces bulk failures instead of reporting them as successes", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const admin = adminFor(rawProduct(true));
    admin.graphql.mockImplementation(async (query) => {
      if (query.includes("PicoCatalogProducts")) return Response.json({ data: { products: { nodes: [rawProduct(true)] } } });
      throw new Error("Product update failed");
    });
    const summary = await optimizeCatalogBulk(admin, "test.myshopify.com");
    expect(summary.failedCount).toBe(1);
    expect(summary.optimizedCount).toBe(0);
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });

  it("does not swallow a refresh response inside bulk optimization", async () => {
    const response = new Response(null, { status: 401 });
    const admin = adminFor(rawProduct(true));
    admin.graphql.mockImplementation(async (query) => {
      if (query.includes("PicoCatalogProducts")) return Response.json({ data: { products: { nodes: [rawProduct(true)] } } });
      throw response;
    });
    await expect(optimizeCatalogBulk(admin, "test.myshopify.com")).rejects.toBe(response);
  });
});
