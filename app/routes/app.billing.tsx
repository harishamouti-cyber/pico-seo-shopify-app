import { useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
  useSearchParams,
} from "@remix-run/react";
import { TitleBar } from "@shopify/app-bridge-react";
import {
  CheckCircleIcon,
  CheckIcon,
  ShieldCheckIcon,
} from "../components/icons";
import {
  cancelProSubscription,
  createProSubscription,
  PICOSEO_PLAN,
  syncSubscriptionStatus,
} from "../services/billing.server";
import { getOrCreateSettings } from "../services/settings.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const [, billing] = await Promise.all([
    getOrCreateSettings(session.shop, admin),
    syncSubscriptionStatus(admin, session.shop),
  ]);

  return json({
    shop: session.shop,
    plan: PICOSEO_PLAN,
    subscriptionStatus: billing.status,
    activeSubscription: billing.activeSubscription,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "start_trial");

  try {
    if (intent === "cancel_subscription") {
      const subscriptionId = String(formData.get("subscriptionId") || "");
      if (!subscriptionId) {
        return json(
          {
            ok: false,
            confirmationUrl: null,
            message: "No active subscription found.",
          },
          { status: 400 },
        );
      }
      await cancelProSubscription(admin, session.shop, subscriptionId);
      return json({
        ok: true,
        confirmationUrl: null,
        message:
          "Your PicoSEO Pro subscription has been cancelled. You will not be billed again.",
      });
    }

    const { confirmationUrl } = await createProSubscription(
      admin,
      session.shop,
      request.url,
    );
    return json({
      ok: true,
      confirmationUrl,
      message: "Redirecting to Shopify secure billing confirmation…",
    });
  } catch (error) {
    if (error instanceof Response) throw error;
    return json(
      {
        ok: false,
        confirmationUrl: null,
        message:
          error instanceof Error
            ? error.message
            : "Unable to initialize Shopify subscription.",
      },
      { status: 500 },
    );
  }
};

const PRO_FEATURES = [
  "1-Click Google Search Titles & Descriptions for every product",
  "Automatic Product Photo SEO so your images rank on Google Images",
  "Google Rich Snippets showing live Price, In-Stock status & Brand",
  "ChatGPT, Perplexity & AI Shopping Assistant product visibility",
  "Instant Search Engine Updates whenever you add or edit products",
  "Main Product Photo Speed Boost with zero storefront slowdown",
  "Live Google Search & ChatGPT Preview Studio for Desktop and Mobile",
  "Unlimited products and unlimited optimizations with no hidden quotas",
] as const;

export default function BillingRoute() {
  const { plan, subscriptionStatus, activeSubscription } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();

  const isSubmitting = navigation.state === "submitting";
  const justConfirmed = searchParams.get("charge") === "confirmed";
  const isSubscribed =
    subscriptionStatus === "ACTIVE" || subscriptionStatus === "TRIAL";

  useEffect(() => {
    if (actionData?.confirmationUrl) {
      window.open(actionData.confirmationUrl, "_top");
    }
  }, [actionData]);

  return (
    <div className="pico-billing-canvas">
      <TitleBar title="Billing" />

      <div
        className="pico-billing-container"
        style={{ maxWidth: 780, margin: "0 auto" }}
      >
        {/* Top Reassuring Informational Callout Banner */}
        <div
          className="pico-bento-card"
          style={{
            background: "linear-gradient(90deg, #eff6ff 0%, #f8fafc 100%)",
            borderColor: "#bfdbfe",
            padding: "16px 20px",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <span className="pico-icon-badge">
              <ShieldCheckIcon size={18} />
            </span>
            <div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#0f172a",
                }}
              >
                100% Native Shopify Billing • Risk-Free 7-Day Free Trial
              </div>
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: "#334155",
                }}
              >
                Your subscription is handled securely through your regular
                Shopify invoice. You never need to enter a credit card inside
                PicoSEO, and you can cancel anytime with one click during your
                7-day free trial at zero cost.
              </p>
            </div>
          </div>
        </div>

        {/* Feedback / Confirmation Banners */}
        {(justConfirmed || actionData?.message) && (
          <div
            className="pico-bento-card"
            style={{
              padding: "13px 18px",
              borderColor:
                actionData && !actionData.ok ? "#fecaca" : "#a7f3d0",
              background:
                actionData && !actionData.ok ? "#fef2f2" : "#ecfdf5",
              color: actionData && !actionData.ok ? "#991b1b" : "#065f46",
              fontSize: 13,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CheckCircleIcon size={17} />
              <span>
                {actionData?.message ||
                  "Your PicoSEO Pro plan is active and connected to Shopify Billing."}
              </span>
            </div>
            <span className="pico-pill pico-pill--success">
              {isSubscribed ? "Active" : "Updated"}
            </span>
          </div>
        )}

        {/* Wide, Full-Width Single-Tier Card: PicoSEO Pro */}
        <section className="pico-billing-pro-card">
          <div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "4px 11px",
                  borderRadius: 999,
                  background: "#fef3c7",
                  color: "#92400e",
                  border: "1px solid #fcd34d",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                7-Day Free Trial
              </span>

              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "4px 11px",
                  borderRadius: 999,
                  background: "#dbeafe",
                  color: "#1e40af",
                  border: "1px solid #93c5fd",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                Recommended
              </span>

              <span
                className={`pico-pill ${
                  isSubscribed ? "pico-pill--success" : "pico-pill--info"
                }`}
              >
                {isSubscribed ? "Pro Plan Active" : "Free Trial Available"}
              </span>
            </div>

            <h1
              style={{
                margin: 0,
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "#0f172a",
              }}
            >
              PicoSEO Pro
            </h1>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13.5,
                color: "#475569",
              }}
            >
              Everything you need to rank higher on Google, optimize every
              product photo, and get recommended by AI shopping assistants
              without slowing down your store.
            </p>
          </div>

          {/* Light Gray Summary Box with Left-Aligned Price & Right-Aligned Green Confirmation */}
          <div className="pico-billing-price-box">
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 14,
              }}
            >
              <div>
                <div
                  className="pico-tabular"
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    letterSpacing: "-0.02em",
                    color: "#0f172a",
                  }}
                >
                  ${plan.priceAmount.toFixed(0)} / month (USD)
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#475569",
                    marginTop: 3,
                  }}
                >
                  Includes 7-Day Free Trial • Cancel anytime with 1 click
                </div>
              </div>

              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#047857",
                  textAlign: "right",
                }}
              >
                ✓ No upfront charge today — Billed on your Shopify invoice
              </div>
            </div>
          </div>

          {/* Benefit-Driven Feature Checklist with Green Checkmarks */}
          <ul className="pico-billing-checklist">
            {PRO_FEATURES.map((feature) => (
              <li
                key={feature}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  fontSize: 13.5,
                  lineHeight: 1.45,
                  color: "#1e293b",
                }}
              >
                <span
                  style={{
                    color: "#10b981",
                    display: "inline-flex",
                    marginTop: 1,
                    flexShrink: 0,
                  }}
                >
                  <CheckCircleIcon size={18} />
                </span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          {/* Primary Action Button */}
          <Form method="post">
            <input type="hidden" name="intent" value="start_trial" />
            <button
              type="submit"
              disabled={isSubmitting}
              className="pico-billing-cta"
            >
              <CheckIcon size={18} />
              <span>
                {isSubmitting
                  ? "Connecting to Shopify Billing…"
                  : isSubscribed
                    ? "Manage Active Subscription"
                    : "Start 7-Day Free Trial"}
              </span>
            </button>
          </Form>

          {activeSubscription && (
            <div
              style={{
                marginTop: 16,
                paddingTop: 14,
                borderTop: "1px solid #e2e8f0",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                fontSize: 12.5,
                color: "#64748b",
              }}
            >
              <span>Your 7-day free trial / Pro plan is active on Shopify.</span>
              <Form method="post">
                <input
                  type="hidden"
                  name="intent"
                  value="cancel_subscription"
                />
                <input
                  type="hidden"
                  name="subscriptionId"
                  value={activeSubscription.id}
                />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="pico-btn pico-btn--secondary"
                  style={{ padding: "5px 11px", fontSize: 12 }}
                >
                  Cancel subscription
                </button>
              </Form>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
