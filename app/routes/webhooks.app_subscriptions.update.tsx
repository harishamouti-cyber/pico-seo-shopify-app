import type { ActionFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { syncSubscriptionStatus } from "../services/billing.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, admin, payload } = await authenticate.webhook(request);

  if (admin) {
    await syncSubscriptionStatus(admin, shop);
    return new Response(null, { status: 200 });
  }

  const sub = (payload as { app_subscription?: { status?: string } })?.app_subscription;
  const rawStatus = sub?.status?.toUpperCase() || "";
  const status = rawStatus === "ACTIVE" ? "ACTIVE" : "INACTIVE";

  await prisma.picoSeoSettings.upsert({
    where: { shop },
    update: { subscriptionStatus: status },
    create: { shop, subscriptionStatus: status },
  });

  return new Response(null, { status: 200 });
};
