import type { PicoSeoSettings } from "@prisma/client";
import prisma from "../db.server";
import { sanitizeStoreName } from "../lib/store-name";
import type { StoreContext } from "../lib/types";
import { type AdminClient, gql } from "./graphql.server";
import { generateIndexNowKey } from "./indexnow.server";

export const PROXY_PREFIX = "/apps/picoseo";

interface ShopQuery {
  shop: {
    name: string;
    myshopifyDomain: string;
    currencyCode: string;
    primaryDomain: { host: string } | null;
  };
}

const SHOP_QUERY = `#graphql
  query PicoStore {
    shop { name myshopifyDomain currencyCode primaryDomain { host } }
  }`;

export async function fetchShopInfo(admin: AdminClient) {
  const data = await gql<ShopQuery>(admin, SHOP_QUERY);
  return data.shop;
}

export function toStoreContext(shop: ShopQuery["shop"], settings: Pick<PicoSeoSettings, "storeDisplayName">): StoreContext {
  return {
    storeName: settings.storeDisplayName,
    shopDomain: shop.myshopifyDomain,
    host: shop.primaryDomain?.host || shop.myshopifyDomain,
    currencyCode: shop.currencyCode,
  };
}

export function defaultSettings(shop: string, storeDisplayName?: string): PicoSeoSettings {
  return {
    id: `settings_${shop}`,
    shop,
    storeDisplayName: sanitizeStoreName(storeDisplayName || shop),
    subscriptionStatus: "INACTIVE",
    autoSyncOnProductUpdate: false,
    metaTitleTemplate: "{{product_title}} | Official {{store_name}}",
    metaDescriptionTemplate:
      "Shop {{product_title}} ({{variant_title}}) for {{price}} at {{store_name}}. Fast shipping and verified quality.",
    imageAltTemplate: "{{product_title}} - {{variant_title}} by {{store_name}}",
    enableJsonLdSchema: true,
    enableLcpImagePreload: true,
    enableLlmsTxtFeed: true,
    enableIndexNowPing: true,
    indexNowApiKey: null,
    totalProductsOptimized: 0,
    totalAltTextsFixed: 0,
    totalIndexNowPings: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/** Loads settings, creating the record (with sanitized store name + IndexNow key) on first run. */
export async function getOrCreateSettings(shop: string, admin?: AdminClient): Promise<PicoSeoSettings> {
  try {
    const existing = await prisma.picoSeoSettings.findUnique({ where: { shop } });
    if (existing) {
      if (!existing.indexNowApiKey) {
        return await prisma.picoSeoSettings.update({
          where: { shop },
          data: { indexNowApiKey: generateIndexNowKey() },
        });
      }
      return existing;
    }

    let rawName: string = shop;
    if (admin) {
      try {
        rawName = (await fetchShopInfo(admin)).name || shop;
      } catch (error) {
        if (error instanceof Response) throw error;
        /* fall back to the domain handle */
      }
    }

    return await prisma.picoSeoSettings.upsert({
      where: { shop },
      update: {},
      create: {
        shop,
        storeDisplayName: sanitizeStoreName(rawName),
        indexNowApiKey: generateIndexNowKey(),
      },
    });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.warn("[PicoSEO] getOrCreateSettings database fallback:", error);
    return defaultSettings(shop);
  }
}

export function hasActivePlan(settings: Pick<PicoSeoSettings, "subscriptionStatus">) {
  return settings.subscriptionStatus === "ACTIVE" || settings.subscriptionStatus === "TRIAL";
}

const INSTALLATION_QUERY = `#graphql
  query PicoInstallation { currentAppInstallation { id } }`;

const METAFIELDS_SET = `#graphql
  mutation PicoConfigSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) { userErrors { field message } }
  }`;

const REDIRECT_CREATE = `#graphql
  mutation PicoRedirect($urlRedirect: UrlRedirectInput!) {
    urlRedirectCreate(urlRedirect: $urlRedirect) { urlRedirect { id } userErrors { field message } }
  }`;

/**
 * Publishes merchant toggles to an app-owned metafield that the Liquid
 * app embed reads via `app.metafields.picoseo.config` — no JS, no API calls
 * at render time.
 */
export async function syncThemeConfig(admin: AdminClient, settings: PicoSeoSettings) {
  const { currentAppInstallation } = await gql<{ currentAppInstallation: { id: string } }>(admin, INSTALLATION_QUERY);
  await gql(admin, METAFIELDS_SET, {
    metafields: [
      {
        ownerId: currentAppInstallation.id,
        namespace: "picoseo",
        key: "config",
        type: "json",
        value: JSON.stringify({
          json_ld: settings.enableJsonLdSchema,
          lcp_preload: settings.enableLcpImagePreload,
          llms: settings.enableLlmsTxtFeed,
          store_name: settings.storeDisplayName,
        }),
      },
    ],
  });
}

/**
 * Creates the storefront redirects that expose app-proxy files at the root:
 *   /llms.txt          → /apps/picoseo/llms.txt
 *   /{indexnow-key}.txt → /apps/picoseo/indexnow-key.txt
 * Shopify only applies redirects to paths that would otherwise 404, so this
 * never shadows merchant content. Existing redirects are left untouched.
 */
export async function ensureStoreRedirects(admin: AdminClient, settings: PicoSeoSettings) {
  const redirects = [{ path: "/llms.txt", target: `${PROXY_PREFIX}/llms.txt` }];
  if (settings.indexNowApiKey) {
    redirects.push({ path: `/${settings.indexNowApiKey}.txt`, target: `${PROXY_PREFIX}/indexnow-key.txt` });
  }
  await Promise.all(
    redirects.map((urlRedirect) => gql(admin, REDIRECT_CREATE, { urlRedirect }).catch((error) => {
      if (error instanceof Response) throw error;
    })),
  );
}

export async function ensureStoreInfrastructure(admin: AdminClient, settings: PicoSeoSettings) {
  const results = await Promise.allSettled([syncThemeConfig(admin, settings), ensureStoreRedirects(admin, settings)]);
  for (const result of results) {
    if (result.status === "rejected" && result.reason instanceof Response) throw result.reason;
  }
}
