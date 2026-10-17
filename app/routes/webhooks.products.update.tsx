import type { ActionFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { needsOptimization } from "../lib/seo-score";
import {
  fetchSingleAuditedProduct,
  optimizeSingleProduct,
} from "../services/catalog-seo.server";
import { pingIndexNow } from "../services/indexnow.server";
import { fetchShopInfo, getOrCreateSettings, toStoreContext } from "../services/settings.server";
import { authenticate } from "../shopify.server";

interface ProductWebhookPayload {
  id?: number | string;
  admin_graphql_api_id?: string;
  title?: string;
  handle?: string;
}

/**
 * Handles `products/update` webhooks:
 * 1. If `autoSyncOnProductUpdate` is enabled and the product is missing SEO
 *    metadata or image alt text, auto-populates them via GraphQL and pings IndexNow.
 * 2. Otherwise, if `enableIndexNowPing` is enabled, immediately pings the
 *    IndexNow endpoint with the updated product's canonical storefront URL so
 *    search engines and AI crawlers re-index changes within seconds.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, admin, payload } = await authenticate.webhook(request);
  const body = (payload ?? {}) as ProductWebhookPayload;

  const productGid =
    body.admin_graphql_api_id ||
    (body.id ? `gid://shopify/Product/${body.id}` : null);

  const settings = await getOrCreateSettings(shop, admin ?? undefined);

  if (admin && productGid && settings.autoSyncOnProductUpdate) {
    try {
      const audited = await fetchSingleAuditedProduct(admin, productGid);
      if (audited && needsOptimization(audited)) {
        await optimizeSingleProduct(admin, shop, productGid);
        return new Response(null, { status: 200 });
      }
    } catch (error) {
      console.error("[PicoSEO] Webhook auto-optimize error", error);
    }
  }

  if (settings.enableIndexNowPing && settings.indexNowApiKey && body.handle) {
    let host = shop;
    if (admin) {
      try {
        const shopInfo = await fetchShopInfo(admin);
        host = toStoreContext(shopInfo, settings).host;
      } catch {
        host = shop;
      }
    }

    const url = `https://${host}/products/${body.handle}`;
    const result = await pingIndexNow(host, settings.indexNowApiKey, [url]);
    if (result.ok) {
      await prisma.picoSeoSettings.update({
        where: { shop },
        data: { totalIndexNowPings: { increment: 1 } },
      });
    }
  }

  return new Response(null, { status: 200 });
};
