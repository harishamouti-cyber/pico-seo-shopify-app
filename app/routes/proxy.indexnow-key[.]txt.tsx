import type { LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { authenticateAppProxy } from "../services/app-proxy.server";

/**
 * Serves the IndexNow key at `/apps/picoseo/indexnow-key.txt`.
 * The key is public once published at `/{key}.txt`, but this route still
 * requires a valid Shopify app-proxy signature.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  let shop: string | null = null;
  try {
    const proxy = await authenticateAppProxy(request);
    shop = proxy.shop;
  } catch {
    return new Response("unauthorized\n", {
      status: 401,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (!shop) {
    return new Response("unauthorized\n", {
      status: 401,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const settings = await prisma.picoSeoSettings.findUnique({ where: { shop } });
  if (!settings?.indexNowApiKey) {
    return new Response("picoseo-indexnow-unconfigured\n", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(settings.indexNowApiKey, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
