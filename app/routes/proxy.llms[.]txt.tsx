import type { LoaderFunctionArgs } from "@remix-run/node";
import { buildLlmsDocument, toLlmsProduct } from "../lib/llms";
import { authenticateAppProxy } from "../services/app-proxy.server";
import { fetchCatalogAudit } from "../services/catalog-seo.server";
import { getOrCreateSettings } from "../services/settings.server";

const TEXT = {
  "Content-Type": "text/plain; charset=utf-8",
  "X-Robots-Tag": "noindex",
};

/**
 * Storefront app-proxy route for `/apps/picoseo/llms.txt`.
 * Shopify signs the request. The feed lists active products from the latest
 * scan only.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  let shop: string | null = null;
  let adminClient: { graphql: (q: string, o?: { variables?: Record<string, unknown> }) => Promise<Response> } | null =
    null;

  try {
    const proxy = await authenticateAppProxy(request);
    shop = proxy.shop;
    adminClient = proxy.admin;
  } catch {
    return new Response("PicoSEO could not verify this app proxy request.\n", {
      status: 401,
      headers: TEXT,
    });
  }

  if (!shop || !adminClient) {
    return new Response("PicoSEO is not installed for this store, or the offline session is missing.\n", {
      status: 401,
      headers: TEXT,
    });
  }

  let settings;
  try {
    settings = await getOrCreateSettings(shop, adminClient);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Settings are unavailable.";
    return new Response(`# PicoSEO\n\n> ${message}\n`, { status: 503, headers: TEXT });
  }

  if (!settings.enableLlmsTxtFeed) {
    return new Response(
      `# ${settings.storeDisplayName}\n\n> The catalog feed is turned off in PicoSEO settings.\n`,
      { status: 200, headers: TEXT },
    );
  }

  const audit = await fetchCatalogAudit(adminClient, shop, 50);
  if (audit.catalogError) {
    return new Response(`# ${settings.storeDisplayName}\n\n> ${audit.catalogError}\n`, {
      status: 503,
      headers: TEXT,
    });
  }

  const activeProducts = audit.products
    .filter((product) => product.status === "ACTIVE")
    .map((product) => toLlmsProduct(product, audit.store));

  const document = buildLlmsDocument(audit.store, activeProducts, new Date(), {
    sampleLimit: audit.scannedLimit,
  });

  return new Response(document, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=900, stale-while-revalidate=3600",
    },
  });
}
