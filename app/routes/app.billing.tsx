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
  ShieldCheckIcon,
  SparklesIcon,
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
            message: "No active subscription ID provided.",
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
  "Unlimited 1-Click Bulk SEO Title & Meta Description Optimization",
  "Unlimited Automated Media Image Alt-Text Repair across all variants",
  "Zero-JavaScript Liquid JSON-LD Schema (Product, Offer, Brand & FAQPage)",
  "Core Web Vitals LCP Hero Image Preloading (0.0 kB client script bloat)",
  "Automated /llms.txt AI Crawler Feed for ChatGPT, Perplexity & Claude",
  "Real-Time IndexNow Search Engine Pings on every product update",
  "Live SERP, AI Citation & Mobile/Desktop Bezel Customizer Studio",
  "Interactive Live SEO & Speed Diagnostic Simulator with Schema Validator",
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
      <TitleBar title="Subscription & Billing" />

      <div
        className="pico-billing-container"
        style={{ maxWidth: 800, margin: "0 auto" }}
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
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: "#2563eb",
                color: "#ffffff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                marginTop: 1,
              }}
            >
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
                All subscription charges are processed natively through
                Shopify’s secure billing system (`appSubscriptionCreate`). You
                will never enter a credit card inside PicoSEO, and you can
                cancel in one click at any time during your 7-day free trial
                with zero charge.
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
                  "Your PicoSEO Pro subscription is active and synced with Shopify Billing."}
              </span>
            </div>
            <span className="pico-pill pico-pill--success">
              Status: {subscriptionStatus}
            </span>
          </div>
        )}

        {/* Wide, Full-Width Single-Tier Card: PicoSEO Pro */}
        <section className="pico-billing-pro-card">
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
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
                {/* Yellow "7-Day Free Trial" pill badge */}
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

                {/* "Recommended" badge */}
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
                  Current status: {subscriptionStatus}
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
                Complete all-in-one SEO automation, zero-JavaScript Liquid
                schema, LCP acceleration, IndexNow & /llms.txt AI search engine
                visibility.
              </p>
            </div>

            <div style={{ textAlign: "right" }}>
              <div
                className="pico-tabular"
                style={{
                  fontSize: 34,
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  color: "#0f172a",
                  lineHeight: 1,
                }}
              >
                ${plan.priceAmount.toFixed(0)}
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: "#64748b",
                  }}
                >
                  {" "}
                  / month
                </span>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "#64748b",
                  marginTop: 4,
                }}
              >
                USD • Every 30 days after trial
              </div>
            </div>
          </div>

          {/* Bold Price Summary Box */}
          <div className="pico-billing-price-box">
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#0f172a",
                }}
              >
                No upfront charge today • Billed on your Shopify invoice
              </div>
              <span
                className="pico-tabular"
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "#047857",
                }}
              >
                Due today: $0.00 USD
              </span>
            </div>
            <div
              style={{
                fontSize: 12.5,
                color: "#475569",
                marginTop: 4,
              }}
            >
              Includes every PicoSEO feature with zero usage tiers, zero quota
              paywalls, and zero storefront JavaScript bloat.
            </div>
          </div>

          {/* Generous Full-Width Feature Checklist with Green Checkmarks */}
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

          {/* Full-Width Dark Primary Action Button ("Start 7-Day Free Trial") */}
          <Form method="post">
            <input type="hidden" name="intent" value="start_trial" />
            <button
              type="submit"
              disabled={isSubmitting}
              className="pico-billing-cta"
            >
              <SparklesIcon size={18} />
              <span>
                {isSubmitting
                  ? "Connecting to Shopify Billing…"
                  : isSubscribed
                    ? "Re-Verify 7-Day Free Trial / Active Plan"
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
              <span className="pico-tabular">
                Active Shopify Subscription ID:{" "}
                <code>{activeSubscription.id}</code>
                {activeSubscription.test ? " (Test Charge)" : ""}
              </span>
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
