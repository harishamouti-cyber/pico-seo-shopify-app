import { authenticate, unauthenticated } from "../shopify.server";

/**
 * App proxy requests must carry a valid Shopify signature. A `?shop=` query
 * value is not accepted on its own.
 */
export async function authenticateAppProxy(request: Request) {
  const proxy = await authenticate.public.appProxy(request);
  const shop = proxy.session?.shop ?? null;
  if (!shop) {
    return { shop: null, admin: null };
  }

  if (proxy.admin) {
    return { shop, admin: proxy.admin };
  }

  try {
    const offline = await unauthenticated.admin(shop);
    return { shop, admin: offline.admin };
  } catch {
    return { shop, admin: null };
  }
}
