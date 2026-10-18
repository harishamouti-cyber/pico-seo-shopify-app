import { useEffect, useMemo, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useFetcher, useLoaderData, useRevalidator } from "@remix-run/react";
import { TitleBar } from "@shopify/app-bridge-react";
import {
  LiveStatusDot,
  ProductThumbnail,
  RadialScoreGauge,
  ScoreBadge,
  SpringSegmentedControl,
} from "../components/bento-primitives";
import {
  BoltIcon,
  CheckCircleIcon,
  ExternalArrowIcon,
  GlobeSearchIcon,
  ImageFrameIcon,
  RadarIcon,
  RefreshCwIcon,
} from "../components/icons";
import { needsOptimization } from "../lib/seo-score";
import { formatPrice } from "../lib/seo-template";
import {
  fetchCatalogAudit,
  optimizeCatalogBulk,
  optimizeSingleProduct,
} from "../services/catalog-seo.server";
import { getThemeEmbedInfo } from "../services/theme.server";
import { authenticate } from "../shopify.server";

export const config = {
  maxDuration: 60,
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const [audit, themeEmbed] = await Promise.all([
    fetchCatalogAudit(admin, session.shop, 50),
    getThemeEmbedInfo(admin, session.shop),
  ]);

  return json({
    audit,
    themeEmbed,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  try {
    if (intent === "optimize_single") {
      const productId = String(formData.get("productId") || "");
      const forceOverwrite = formData.get("forceOverwrite") === "true";
      const result = await optimizeSingleProduct(admin, session.shop, productId, {
        forceOverwrite,
      });
      return json({
        ok: true,
        intent,
        message: `Optimized "${result.productTitle}" (${result.seoScoreBefore} → ${result.seoScoreAfter}/100).`,
        result,
      });
    }

    if (intent === "bulk_optimize") {
      const forceOverwriteAll = formData.get("forceOverwriteAll") === "true";
      const summary = await optimizeCatalogBulk(admin, session.shop, {
        forceOverwriteAll,
      });
      return json({
        ok: summary.failedCount === 0,
        intent,
        message:
          summary.optimizedCount === 0
            ? "All products are already optimized for Google Search and AI Shopping Assistants."
            : `Optimized ${summary.optimizedCount} ${summary.optimizedCount === 1 ? "product" : "products"} and updated ${summary.altTextsFixed} photo ${summary.altTextsFixed === 1 ? "description" : "descriptions"} (Store SEO Health Score: ${summary.averageScoreAfter}/100).`,
        summary,
      });
    }

    return json({ ok: false, message: "Unknown action intent." }, { status: 400 });
  } catch (error) {
    if (error instanceof Response) throw error;
    return json(
      {
        ok: false,
        intent,
        message:
          error instanceof Error ? error.message : "Optimization action failed.",
      },
      { status: 500 },
    );
  }
};

type FilterTab = "all" | "needs_fix" | "optimized";

export default function SeoOverviewRoute() {
  const { audit, themeEmbed } = useLoaderData<typeof loader>();
  const bulkFetcher = useFetcher<typeof action>();
  const rowFetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();

  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    try {
      if (window.localStorage.getItem("picoseo_embed_banner_dismissed") === "1") {
        setBannerDismissed(true);
      }
    } catch {
      // ignore storage errors in restricted iframes
    }
  }, []);

  const handleDismissBanner = () => {
    setBannerDismissed(true);
    try {
      window.localStorage.setItem("picoseo_embed_banner_dismissed", "1");
    } catch {
      // ignore
    }
  };

  const isBulkRunning =
    bulkFetcher.state !== "idle" &&
    bulkFetcher.formData?.get("intent") === "bulk_optimize";

  const activeRowProductId =
    rowFetcher.state !== "idle"
      ? String(rowFetcher.formData?.get("productId") || "")
      : "";

  const categoryBreakdown = useMemo(() => {
    const total = audit.products.length || 1;
    const titleAvg = Math.round(
      (audit.products.reduce((s, p) => s + p.audit.breakdown.title, 0) /
        (total * 25)) *
        100,
    );
    const descAvg = Math.round(
      (audit.products.reduce((s, p) => s + p.audit.breakdown.description, 0) /
        (total * 25)) *
        100,
    );
    const altAvg = Math.round(
      (audit.products.reduce((s, p) => s + p.audit.breakdown.altText, 0) /
        (total * 30)) *
        100,
    );
    const richAvg = Math.round(
      (audit.products.reduce((s, p) => s + p.audit.breakdown.richData, 0) /
        (total * 20)) *
        100,
    );
    return [
      { label: "Google Search Titles", pct: audit.products.length ? titleAvg : 100 },
      { label: "Google Search Descriptions", pct: audit.products.length ? descAvg : 100 },
      { label: "Product Photo Descriptions", pct: audit.products.length ? altAvg : 100 },
      { label: "Product Details & Pricing", pct: audit.products.length ? richAvg : 100 },
    ];
  }, [audit.products]);

  const filteredProducts = useMemo(() => {
    return audit.products.filter((product) => {
      if (filterTab === "needs_fix" && !needsOptimization(product)) return false;
      if (filterTab === "optimized" && product.audit.score < 80) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        return (
          product.title.toLowerCase().includes(q) ||
          product.handle.toLowerCase().includes(q) ||
          product.vendor.toLowerCase().includes(q) ||
          product.productType.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [audit.products, filterTab, searchQuery]);

  const feedbackBanner =
    (bulkFetcher.data && "message" in bulkFetcher.data && bulkFetcher.data) ||
    (rowFetcher.data && "message" in rowFetcher.data && rowFetcher.data) ||
    null;

  const isSubscribed =
    audit.settings.subscriptionStatus === "ACTIVE" ||
    audit.settings.subscriptionStatus === "TRIAL";

  const healthScoreValue = audit.overallScore ?? 100;
  const healthStatusLabel =
    healthScoreValue >= 85 ? "Excellent" : healthScoreValue >= 60 ? "Good" : "Needs Attention";
  const healthStatusTone =
    healthScoreValue >= 60 ? "pico-pill--success" : "pico-pill--warning";

  const optimizedPhotosCount = useMemo(() => {
    const fromCatalog = audit.products.reduce(
      (sum, p) => sum + Math.max(0, p.images.length - p.audit.missingAltCount),
      0,
    );
    return Math.max(audit.settings.totalAltTextsFixed, fromCatalog);
  }, [audit.products, audit.settings.totalAltTextsFixed]);

  return (
    <div className="pico-shell">
      <TitleBar title="Overview" />

      {/* 1. Top Human-Friendly Status Bar */}
      <div className="pico-health-bar">
        <div className="pico-health-pills">
          <span className="pico-health-pill">
            <LiveStatusDot
              tone={audit.settings.enableJsonLdSchema ? "live" : "muted"}
            />
            Google Rich Snippets:{" "}
            <strong>
              {audit.settings.enableJsonLdSchema ? "Active" : "Off"}
            </strong>
          </span>
          <span className="pico-health-divider" />
          <span className="pico-health-pill">
            <LiveStatusDot
              tone={audit.settings.enableLcpImagePreload ? "live" : "muted"}
            />
            Photo Speed Boost:{" "}
            <strong>
              {audit.settings.enableLcpImagePreload ? "Active" : "Off"}
            </strong>
          </span>
          <span className="pico-health-divider" />
          <span className="pico-health-pill">
            <LiveStatusDot
              tone={audit.settings.enableLlmsTxtFeed ? "live" : "muted"}
            />
            ChatGPT &amp; AI Feed:{" "}
            <strong>
              {audit.settings.enableLlmsTxtFeed ? "Active" : "Off"}
            </strong>
          </span>
          <span className="pico-health-divider" />
          <span className="pico-health-pill">
            <LiveStatusDot
              tone={audit.settings.enableIndexNowPing ? "live" : "muted"}
            />
            Instant Search Sync:{" "}
            <strong>
              {audit.settings.enableIndexNowPing ? "Active" : "Off"}
            </strong>
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {isSubscribed ? (
            <Link
              to="/app/billing"
              className="pico-pill pico-pill--success"
              style={{ textDecoration: "none", padding: "5px 12px" }}
            >
              Pro Plan Active
            </Link>
          ) : (
            <Link
              to="/app/billing"
              className="pico-pill pico-pill--blue"
              style={{ textDecoration: "none", padding: "5px 12px" }}
            >
              Start 7-Day Free Trial →
            </Link>
          )}
          <Link to="/app/settings" className="pico-btn pico-btn--secondary">
            Auto-SEO Rules
          </Link>
        </div>
      </div>

      {/* 2. Dismissible Theme Setup Banner */}
      {!bannerDismissed && (
        <div
          className="pico-bento-card"
          style={{
            marginBottom: 16,
            padding: "16px 20px",
            background:
              "linear-gradient(90deg, rgba(239, 246, 255, 0.9) 0%, rgba(248, 250, 252, 0.95) 100%)",
            borderColor: "#bfdbfe",
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span className="pico-icon-badge">
                <BoltIcon size={18} />
              </span>
              <div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#0f172a",
                  }}
                >
                  Step 1: Turn on PicoSEO in your theme
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "#475569",
                    marginTop: 2,
                  }}
                >
                  Click below to activate automatic Google Rich Snippets and
                  faster product photo loading in one click.
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <a
                href={themeEmbed.deepLinkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="pico-btn pico-btn--primary"
              >
                <span>Open Theme Editor</span>
                <ExternalArrowIcon size={14} />
              </a>
              <button
                type="button"
                onClick={handleDismissBanner}
                className="pico-btn pico-btn--secondary"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Feedback Toast / Callout */}
      {feedbackBanner && (
        <div
          className="pico-bento-card"
          style={{
            marginBottom: 16,
            padding: "12px 18px",
            borderColor: feedbackBanner.ok ? "#a7f3d0" : "#fecaca",
            background: feedbackBanner.ok ? "#ecfdf5" : "#fef2f2",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              fontWeight: 600,
              color: feedbackBanner.ok ? "#065f46" : "#991b1b",
            }}
          >
            <CheckCircleIcon size={17} />
            <span>{feedbackBanner.message}</span>
          </div>
          <span className="pico-pill pico-pill--info">Synced with Shopify</span>
        </div>
      )}

      {/* 3. Store SEO Health Score Card */}
      <section className="pico-bento-card pico-bento-card--hero">
        <div className="pico-hero-grid">
          <RadialScoreGauge score={audit.overallScore} />

          <div>
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
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <span className="pico-pill pico-pill--blue">
                    {audit.store.storeName}
                  </span>
                  <span className={`pico-pill ${healthStatusTone}`}>
                    {healthStatusLabel}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: "#64748b",
                    }}
                  >
                    {audit.store.host}
                  </span>
                </div>
                <h1
                  style={{
                    margin: 0,
                    fontSize: 20,
                    fontWeight: 700,
                    letterSpacing: "-0.02em",
                    color: "#0f172a",
                  }}
                >
                  Store SEO Health Score
                </h1>
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: 13.5,
                    color: "#475569",
                  }}
                >
                  <strong className="pico-tabular">
                    {audit.optimizedProductsCount}
                  </strong>{" "}
                  of your{" "}
                  <strong className="pico-tabular">
                    {audit.products.length}
                  </strong>{" "}
                  products are fully optimized for Google Search and AI Shopping
                  Assistants.
                </p>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <bulkFetcher.Form method="post">
                  <input type="hidden" name="intent" value="bulk_optimize" />
                  <button
                    type="submit"
                    disabled={isBulkRunning || audit.products.length === 0}
                    className="pico-btn pico-btn--primary"
                  >
                    <BoltIcon size={15} />
                    <span>
                      {isBulkRunning
                        ? "Optimizing products…"
                        : audit.productsNeedingFix > 0
                          ? `Fix ${audit.productsNeedingFix} ${audit.productsNeedingFix === 1 ? "Product" : "Products"} in 1 Click`
                          : "Fix All Products in 1 Click"}
                    </span>
                  </button>
                </bulkFetcher.Form>

                <Link to="/app/simulator" className="pico-btn pico-btn--secondary">
                  <RadarIcon size={16} />
                  <span>Preview Products</span>
                </Link>
              </div>
            </div>

            {/* Readiness Breakdown Bars */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "12px 20px",
                marginTop: 18,
                paddingTop: 16,
                borderTop: "1px solid #e2e8f0",
              }}
            >
              {categoryBreakdown.map((item) => (
                <div key={item.label}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#334155",
                      marginBottom: 5,
                    }}
                  >
                    <span>{item.label}</span>
                    <span className="pico-tabular">{item.pct}%</span>
                  </div>
                  <div
                    style={{
                      height: 7,
                      borderRadius: 999,
                      background: "#e2e8f0",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${item.pct}%`,
                        height: "100%",
                        borderRadius: 999,
                        background:
                          item.pct >= 80
                            ? "linear-gradient(90deg, #10b981 0%, #34d399 100%)"
                            : item.pct >= 50
                              ? "linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)"
                              : "linear-gradient(90deg, #ef4444 0%, #f87171 100%)",
                        transition: "width 420ms cubic-bezier(0.22, 1, 0.36, 1)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 4. Three KPI Cards */}
      <section className="pico-kpi-grid">
        <div className="pico-bento-card pico-bento-card--interactive">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: "#475569",
              }}
            >
              Products Optimized for Google
            </span>
            <span className="pico-icon-badge">
              <BoltIcon size={17} />
            </span>
          </div>
          <div
            className="pico-kpi-value pico-tabular"
            style={{
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "#0f172a",
            }}
          >
            {audit.optimizedProductsCount} / {audit.products.length}
          </div>
          <div
            className="pico-tabular"
            style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}
          >
            Ready to rank in search results
          </div>
        </div>

        <div className="pico-bento-card pico-bento-card--interactive">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: "#475569",
              }}
            >
              Product Photos Optimized
            </span>
            <span className="pico-icon-badge">
              <ImageFrameIcon size={17} />
            </span>
          </div>
          <div
            className="pico-kpi-value pico-tabular"
            style={{
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "#0f172a",
            }}
          >
            {optimizedPhotosCount}
          </div>
          <div
            className="pico-tabular"
            style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}
          >
            All product photos have Google Image descriptions
          </div>
        </div>

        <div className="pico-bento-card pico-bento-card--interactive">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: "#475569",
              }}
            >
              Instant Search Engine Updates
            </span>
            <span className="pico-icon-badge">
              <GlobeSearchIcon size={17} />
            </span>
          </div>
          <div
            className="pico-kpi-value pico-tabular"
            style={{
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "#0f172a",
            }}
          >
            {audit.settings.totalIndexNowPings}
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
            Automatically notifies Google, Bing &amp; AI engines when products change
          </div>
        </div>
      </section>

      {/* 5. Product Table ("Your Products") */}
      <section className="pico-bento-card" style={{ marginTop: 18 }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 600,
                color: "#0f172a",
              }}
            >
              Your Products
            </h2>
            <p
              style={{
                margin: "3px 0 0",
                fontSize: 12.5,
                color: "#64748b",
              }}
            >
              Review your products and auto-fix missing Google titles or photo
              descriptions in one click.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 10,
            }}
          >
            <button
              type="button"
              className="pico-btn pico-btn--secondary"
              onClick={() => revalidator.revalidate()}
              disabled={
                revalidator.state !== "idle" ||
                bulkFetcher.state !== "idle" ||
                rowFetcher.state !== "idle"
              }
            >
              <RefreshCwIcon size={13} />
              <span>{revalidator.state !== "idle" ? "Refreshing…" : "Refresh"}</span>
            </button>
            <SpringSegmentedControl<FilterTab>
              ariaLabel="Filter products"
              value={filterTab}
              onChange={setFilterTab}
              options={[
                {
                  value: "all",
                  label: `All (${audit.products.length})`,
                },
                {
                  value: "needs_fix",
                  label: `Needs fix (${audit.productsNeedingFix})`,
                },
                {
                  value: "optimized",
                  label: `Optimized (${audit.optimizedProductsCount})`,
                },
              ]}
            />

            <input
              type="search"
              aria-label="Search products"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products…"
              className="pico-input"
              style={{ width: 220, padding: "6px 11px", fontSize: 12.5 }}
            />
          </div>
        </div>

        <div className="pico-table-wrap">
          <table className="pico-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Status</th>
                <th>SEO Score</th>
                <th>Google &amp; AI Readiness</th>
                <th style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      textAlign: "center",
                      padding: "32px 16px",
                      color: "#64748b",
                    }}
                  >
                    {audit.products.length === 0
                      ? "No products found in your store yet. Add products in Shopify Admin to optimize them."
                      : "No products match your current filter."}
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                  const isRowOptimizing = activeRowProductId === product.id;
                  const isFullyOptimized = product.audit.score >= 100;
                  const criticalIssues = product.audit.issues.filter(
                    (i) => i.tone === "critical" || i.tone === "warning",
                  );

                  return (
                    <tr key={product.id}>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                          }}
                        >
                          <ProductThumbnail
                            src={product.thumbnailUrl}
                            alt={product.images[0]?.alt || product.title}
                          />
                          <div>
                            <div
                              style={{
                                fontWeight: 600,
                                color: "#0f172a",
                                fontSize: 13.5,
                              }}
                            >
                              {product.title}
                            </div>
                            <div
                              className="pico-tabular"
                              style={{
                                fontSize: 12,
                                color: "#64748b",
                                marginTop: 2,
                              }}
                            >
                              {formatPrice(
                                product.minPrice,
                                audit.store.currencyCode,
                              )}{" "}
                              • {product.images.length} photo
                              {product.images.length === 1 ? "" : "s"} •{" "}
                              {product.variants.length} variant
                              {product.variants.length === 1 ? "" : "s"}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span
                          className={`pico-pill ${
                            product.status === "ACTIVE"
                              ? "pico-pill--success"
                              : "pico-pill--info"
                          }`}
                        >
                          {product.status === "ACTIVE" ? "Active" : product.status}
                        </span>
                      </td>

                      <td>
                        <ScoreBadge score={product.audit.score} />
                      </td>

                      <td>
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 6,
                          }}
                        >
                          {criticalIssues.length === 0 ? (
                            <span className="pico-pill pico-pill--success">
                              <CheckCircleIcon size={13} />
                              Ready for Google &amp; AI
                            </span>
                          ) : (
                            criticalIssues.map((issue) => (
                              <span
                                key={issue.key}
                                className={`pico-pill pico-pill--${issue.tone}`}
                              >
                                {issue.label}
                              </span>
                            ))
                          )}
                        </div>
                      </td>

                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <Link
                            to={`/app/simulator?productId=${encodeURIComponent(
                              product.id,
                            )}`}
                            className="pico-btn pico-btn--secondary"
                            style={{ padding: "6px 10px", fontSize: 12 }}
                          >
                            Preview
                          </Link>

                          <rowFetcher.Form method="post">
                            <input
                              type="hidden"
                              name="intent"
                              value="optimize_single"
                            />
                            <input
                              type="hidden"
                              name="productId"
                              value={product.id}
                            />
                            <input
                              type="hidden"
                              name="forceOverwrite"
                              value={
                                needsOptimization(product) ? "false" : "true"
                              }
                            />
                            <button
                              type="submit"
                              disabled={isRowOptimizing || isBulkRunning}
                              className={`pico-btn ${
                                isFullyOptimized
                                  ? "pico-btn--ghost"
                                  : "pico-btn--primary"
                              }`}
                              style={{ padding: "6px 12px", fontSize: 12 }}
                            >
                              {isFullyOptimized ? (
                                <CheckCircleIcon size={13} />
                              ) : (
                                <BoltIcon size={13} />
                              )}
                              <span>
                                {isRowOptimizing
                                  ? "Fixing…"
                                  : isFullyOptimized
                                    ? "Optimized"
                                    : "Fix SEO Now"}
                              </span>
                            </button>
                          </rowFetcher.Form>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent Optimization Activity */}
      {audit.recentLogs.length > 0 && (
        <section className="pico-bento-card" style={{ marginTop: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: 14.5,
                fontWeight: 600,
                color: "#0f172a",
              }}
            >
              Recent Updates
            </h3>
            <span className="pico-pill pico-pill--info pico-tabular">
              Last {audit.recentLogs.length} updates
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 10,
            }}
          >
            {audit.recentLogs.slice(0, 6).map((log) => (
              <div
                key={log.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #e2e8f0",
                  background: "#f8fafc",
                }}
              >
                <ProductThumbnail
                  src={log.productImageUrl}
                  alt={log.productTitle}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: "#0f172a",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {log.productTitle}
                  </div>
                  <div
                    className="pico-tabular"
                    style={{ fontSize: 11.5, color: "#475569", marginTop: 2 }}
                  >
                    Score {log.seoScoreBefore} →{" "}
                    <strong style={{ color: "#047857" }}>
                      {log.seoScoreAfter}
                    </strong>{" "}
                    • {log.altTextsUpdatedCount} photo{" "}
                    {log.altTextsUpdatedCount === 1 ? "description" : "descriptions"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
