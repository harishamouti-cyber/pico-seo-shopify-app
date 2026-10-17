import type { LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

/**
 * Serves the merchant's IndexNow verification key in plain text at
 * `/apps/picoseo/indexnow-key.txt` (and via root URL redirect `/{key}.txt`).
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  let shop = url.searchParams.get("shop") || "";

  try {
    const proxy = await authenticate.public.appProxy(request);
    if (proxy.session?.shop) {
      shop = proxy.session.shop;
    }
  } catch {
    // Fallback to query param if inspected directly
  }

  if (!shop) {
    return new Response("picoseo-indexnow-unconfigured", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const settings = await prisma.picoSeoSettings.findUnique({ where: { shop } });
  if (!settings?.indexNowApiKey) {
    return new Response("picoseo-indexnow-unconfigured", {
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
