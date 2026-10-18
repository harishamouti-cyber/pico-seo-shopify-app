import type { PicoSeoSettings } from "@prisma/client";
import prisma from "../db.server";
import { DEFAULT_TEMPLATES } from "../lib/seo-template";
import { formatStoreDomain, sanitizeStoreName } from "../lib/store-name";
import type { StoreContext } from "../lib/types";
import { type AdminClient, gql } from "./graphql.server";
import { generateIndexNowKey } from "./indexnow.server";

export const PROXY_PREFIX = "/apps/picoseo";

export interface ShopInfo {
  name: string;
  myshopifyDomain: string;
  currencyCode: string;
  primaryDomain: { host: string } | null;
}

interface ShopQuery {
  shop: ShopInfo;
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
  const cleanName = sanitizeStoreName(
    settings.storeDisplayName && settings.storeDisplayName !== "Your Store"
      ? settings.storeDisplayName
      : shop.name || shop.myshopifyDomain,
  );
  const rawHost = shop.primaryDomain?.host || shop.myshopifyDomain;
  return {
    storeName: cleanName,
    shopDomain: shop.myshopifyDomain,
    host: formatStoreDomain(rawHost, cleanName),
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
    metaTitleTemplate: DEFAULT_TEMPLATES.metaTitleTemplate,
    metaDescriptionTemplate: DEFAULT_TEMPLATES.metaDescriptionTemplate,
    imageAltTemplate: DEFAULT_TEMPLATES.imageAltTemplate,
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
    console.warn("[PicoSEO] getOrCreateSettings failed:", error);
    throw new Error(
      "PicoSEO could not read or create this shop's settings. Check that DATABASE_URL points at a database this app can write, then reload.",
    );
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
  const result = await gql<{ metafieldsSet: { userErrors: { field?: string[] | null; message: string }[] } }>(
    admin,
    METAFIELDS_SET,
    {
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
    },
  );
  if (result.metafieldsSet.userErrors?.length) {
    throw new Error(result.metafieldsSet.userErrors.map((error) => error.message).join(" "));
  }
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
