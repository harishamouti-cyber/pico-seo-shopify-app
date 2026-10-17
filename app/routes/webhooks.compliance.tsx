import type { ActionFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

/**
 * Handles mandatory GDPR / privacy compliance webhooks:
 * - customers/data_request
 * - customers/redact
 * - shop/redact
 * PicoSEO stores zero customer PII; on `shop/redact` we purge shop records.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);

  if (topic === "SHOP_REDACT") {
    await Promise.allSettled([
      prisma.productOptimizationLog.deleteMany({ where: { shop } }),
      prisma.picoSeoSettings.deleteMany({ where: { shop } }),
      prisma.session.deleteMany({ where: { shop } }),
    ]);
  }

  return new Response(null, { status: 200 });
};
