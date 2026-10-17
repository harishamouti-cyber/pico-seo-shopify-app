import type { LoaderFunctionArgs } from "@remix-run/node";
import { buildLlmsDocument, toLlmsProduct } from "../lib/llms";
import { fetchCatalogAudit } from "../services/catalog-seo.server";
import { getOrCreateSettings } from "../services/settings.server";
import { authenticate, unauthenticated } from "../shopify.server";

/**
 * Dynamic Shopify App Proxy route serving `/llms.txt` (via `/apps/picoseo/llms.txt`
 * or root `/llms.txt` redirect).
 * Outputs a clean Markdown & plain-text catalog summary listing the store's
 * brand profile, active product titles, prices, availability, and direct
 * purchase URLs for ChatGPT, Perplexity, and Claude.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  let shop = url.searchParams.get("shop") || "";
  let adminClient: { graphql: (q: string, o?: { variables?: Record<string, unknown> }) => Promise<Response> } | null = null;

  try {
    const proxyCtx = await authenticate.public.appProxy(request);
    if (proxyCtx.session?.shop) {
      shop = proxyCtx.session.shop;
    }
    if (proxyCtx.admin) {
      adminClient = proxyCtx.admin;
    }
  } catch {
    // Allow direct inspection in development / simulator with ?shop=
  }

  if (!adminClient && shop) {
    try {
      const unauth = await unauthenticated.admin(shop);
      adminClient = unauth.admin;
    } catch {
      adminClient = null;
    }
  }

  if (!shop || !adminClient) {
    const fallbackBody = [
      "# PicoSEO AI Crawler Feed (/llms.txt)",
      "",
      "> Connect a Shopify store or pass `?shop=your-store.myshopify.com` to render the live catalog feed for ChatGPT, Perplexity, and Claude.",
    ].join("\n");
    return new Response(fallbackBody, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=60",
      },
    });
  }

  const settings = await getOrCreateSettings(shop, adminClient);
  if (!settings.enableLlmsTxtFeed) {
    return new Response(`# ${settings.storeDisplayName}\n\n> AI crawler feed (/llms.txt) is currently disabled by the merchant.\n`, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Robots-Tag": "noindex",
      },
    });
  }

  const audit = await fetchCatalogAudit(adminClient, shop, 50);
  const activeProducts = audit.products
    .filter((p) => p.status === "ACTIVE" || audit.products.every((item) => item.status !== "ACTIVE"))
    .map((p) => toLlmsProduct(p, audit.store));

  const document = buildLlmsDocument(audit.store, activeProducts);

  return new Response(document, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=900, stale-while-revalidate=3600",
      "X-PicoSEO-Feed": "llms-txt-v1",
    },
  });
}
