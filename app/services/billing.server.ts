export type SubscriptionStatus = "ACTIVE" | "TRIAL" | "INACTIVE";
import prisma from "../db.server";
import { type AdminClient, formatUserErrors, gql, type UserError } from "./graphql.server";

export const PICOSEO_PLAN = {
  name: "PicoSEO Pro",
  priceAmount: 9.0,
  currencyCode: "USD",
  trialDays: 7,
  interval: "EVERY_30_DAYS",
} as const;

interface ActiveSubscription {
  id: string;
  name: string;
  status: string;
  test: boolean;
  trialDays: number;
  currentPeriodEnd?: string | null;
  createdAt: string;
}

const ACTIVE_SUBSCRIPTIONS_QUERY = `#graphql
  query PicoActiveSubscriptions {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        test
        trialDays
        currentPeriodEnd
        createdAt
      }
    }
  }
`;

const CREATE_SUBSCRIPTION_MUTATION = `#graphql
  mutation PicoCreateSubscription(
    $name: String!
    $returnUrl: URL!
    $trialDays: Int!
    $test: Boolean!
    $amount: Decimal!
    $currencyCode: CurrencyCode!
  ) {
    appSubscriptionCreate(
      name: $name
      returnUrl: $returnUrl
      trialDays: $trialDays
      test: $test
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              price: { amount: $amount, currencyCode: $currencyCode }
              interval: EVERY_30_DAYS
            }
          }
        }
      ]
    ) {
      confirmationUrl
      appSubscription {
        id
        name
        status
        trialDays
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const CANCEL_SUBSCRIPTION_MUTATION = `#graphql
  mutation PicoCancelSubscription($id: ID!) {
    appSubscriptionCancel(id: $id) {
      appSubscription {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

function deriveSubscriptionStatus(sub: ActiveSubscription | undefined): SubscriptionStatus {
  if (!sub) return "INACTIVE";
  const normalized = sub.status.toUpperCase();
  if (normalized === "ACTIVE") {
    if (sub.trialDays > 0) {
      const createdMs = Date.parse(sub.createdAt);
      if (Number.isFinite(createdMs)) {
        const trialEndMs = createdMs + sub.trialDays * 86_400_000;
        if (Date.now() < trialEndMs) {
          return "TRIAL";
        }
      }
    }
    return "ACTIVE";
  }
  return "INACTIVE";
}

export async function syncSubscriptionStatus(
  admin: AdminClient,
  shop: string,
): Promise<{
  status: SubscriptionStatus;
  activeSubscription: ActiveSubscription | null;
}> {
  try {
    const data = await gql<{
      currentAppInstallation: { activeSubscriptions: ActiveSubscription[] };
    }>(admin, ACTIVE_SUBSCRIPTIONS_QUERY);

    const activeSub = data.currentAppInstallation?.activeSubscriptions?.[0] ?? null;
    const status = deriveSubscriptionStatus(activeSub ?? undefined);

    await prisma.picoSeoSettings.upsert({
      where: { shop },
      update: { subscriptionStatus: status },
      create: { shop, subscriptionStatus: status },
    });

    return { status, activeSubscription: activeSub };
  } catch (error) {
    console.error("[PicoSEO] Failed syncing subscription status", error);
    const settings = await prisma.picoSeoSettings.findUnique({ where: { shop } });
    return {
      status: settings?.subscriptionStatus ?? "INACTIVE",
      activeSubscription: null,
    };
  }
}

export function buildBillingReturnUrl(shop: string, requestUrl: string): string {
  const handle = process.env.SHOPIFY_APP_HANDLE || "picoseo";
  const storeSlug = shop.replace(/\.myshopify\.com$/i, "");
  // Returning to the embedded admin route ensures the merchant lands back
  // inside Shopify Admin after approving the subscription charge.
  if (storeSlug && !requestUrl.includes("localhost")) {
    return `https://admin.shopify.com/store/${storeSlug}/apps/${handle}/app/billing?charge=confirmed`;
  }
  const origin = new URL(process.env.SHOPIFY_APP_URL || requestUrl).origin;
  return `${origin}/app/billing?shop=${encodeURIComponent(shop)}&charge=confirmed`;
}

export async function createProSubscription(
  admin: AdminClient,
  shop: string,
  requestUrl: string,
): Promise<{ confirmationUrl: string }> {
  const isTest = process.env.SHOPIFY_BILLING_TEST !== "false";
  const returnUrl = buildBillingReturnUrl(shop, requestUrl);

  const data = await gql<{
    appSubscriptionCreate: {
      confirmationUrl: string | null;
      appSubscription: { id: string; status: string } | null;
      userErrors: UserError[];
    };
  }>(admin, CREATE_SUBSCRIPTION_MUTATION, {
    name: PICOSEO_PLAN.name,
    returnUrl,
    trialDays: PICOSEO_PLAN.trialDays,
    test: isTest,
    amount: PICOSEO_PLAN.priceAmount.toFixed(2),
    currencyCode: PICOSEO_PLAN.currencyCode,
  });

  if (data.appSubscriptionCreate.userErrors?.length) {
    throw new Error(formatUserErrors(data.appSubscriptionCreate.userErrors));
  }

  if (!data.appSubscriptionCreate.confirmationUrl) {
    throw new Error("Shopify did not return a billing confirmation URL.");
  }

  return { confirmationUrl: data.appSubscriptionCreate.confirmationUrl };
}

export async function cancelProSubscription(
  admin: AdminClient,
  shop: string,
  subscriptionId: string,
) {
  const data = await gql<{
    appSubscriptionCancel: { userErrors: UserError[] };
  }>(admin, CANCEL_SUBSCRIPTION_MUTATION, { id: subscriptionId });

  if (data.appSubscriptionCancel.userErrors?.length) {
    throw new Error(formatUserErrors(data.appSubscriptionCancel.userErrors));
  }

  await prisma.picoSeoSettings.update({
    where: { shop },
    data: { subscriptionStatus: "INACTIVE" },
  });
}
