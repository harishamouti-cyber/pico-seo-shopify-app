import { useEffect, useMemo, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useFetcher, useLoaderData } from "@remix-run/react";
import { TitleBar } from "@shopify/app-bridge-react";
import {
  LiveStatusDot,
  PartnerSuiteFooter,
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
  SparklesIcon,
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
        message: `Optimized "${result.productTitle}" (${result.seoScoreBefore} → ${result.seoScoreAfter}/100)`,
        result,
      });
    }

    if (intent === "bulk_optimize") {
      const forceOverwriteAll = formData.get("forceOverwriteAll") === "true";
      const summary = await optimizeCatalogBulk(admin, session.shop, {
        forceOverwriteAll,
      });
      return json({
        ok: true,
        intent,
        message: `Optimized ${summary.optimizedCount} product(s), repaired ${summary.altTextsFixed} alt text(s), average score ${summary.averageScoreAfter}/100.`,
        summary,
      });
    }

    return json({ ok: false, message: "Unknown action intent." }, { status: 400 });
  } catch (error) {
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
      { label: "SEO title coverage", pct: audit.products.length ? titleAvg : 100 },
      { label: "Meta description quality", pct: audit.products.length ? descAvg : 100 },
      { label: "Media alt-text completeness", pct: audit.products.length ? altAvg : 100 },
      { label: "AI citation & schema depth", pct: audit.products.length ? richAvg : 100 },
    ];
  }, [audit.products]);

  const filteredProducts = useMemo(() => {
    return audit.products.filter((product) => {
      if (filterTab === "needs_fix" && !needsOptimization(product)) return false;
      if (filterTab === "optimized" && product.audit.score < 80) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
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

  return (
    <div className="pico-shell">
      <TitleBar title="SEO & AI Overview" />

      {/* 1. Live System Health Bar */}
      <div className="pico-health-bar">
        <div className="pico-health-pills">
          <span className="pico-health-pill">
            <LiveStatusDot
              tone={audit.settings.enableJsonLdSchema ? "live" : "muted"}
            />
            Zero-JS JSON-LD Schema:{" "}
            <strong>
              {audit.settings.enableJsonLdSchema ? "Active" : "Paused"}
            </strong>
          </span>
          <span className="pico-health-pill">
            <LiveStatusDot
              tone={audit.settings.enableLcpImagePreload ? "live" : "muted"}
            />
            LCP Image Preload:{" "}
            <strong>
              {audit.settings.enableLcpImagePreload ? "Active" : "Paused"}
            </strong>
          </span>
          <span className="pico-health-pill">
            <LiveStatusDot
              tone={audit.settings.enableLlmsTxtFeed ? "live" : "muted"}
            />
            /llms.txt AI Feed:{" "}
            <strong>
              {audit.settings.enableLlmsTxtFeed ? "Live" : "Paused"}
            </strong>
          </span>
          <span className="pico-health-pill">
            <LiveStatusDot
              tone={audit.settings.enableIndexNowPing ? "live" : "amber"}
            />
            IndexNow Pinger:{" "}
            <strong>
              {audit.settings.enableIndexNowPing ? "Connected" : "Paused"}
            </strong>
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link
            to="/app/billing"
            className={`pico-pill ${
              audit.settings.subscriptionStatus === "ACTIVE" ||
              audit.settings.subscriptionStatus === "TRIAL"
                ? "pico-pill--success"
                : "pico-pill--warning"
            }`}
            style={{ textDecoration: "none" }}
          >
            Plan: {audit.settings.subscriptionStatus}
          </Link>
          <Link to="/app/settings" className="pico-btn pico-btn--secondary">
            Configure templates
          </Link>
        </div>
      </div>

      {/* 2. Dismissible Theme Editor Deep-Link Onboarding Banner */}
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
              <span
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "#2563eb",
                  color: "#ffffff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
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
                  Enable Zero-JS Schema & LCP Preload in {themeEmbed.themeName}
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "#475569",
                    marginTop: 2,
                  }}
                >
                  Activate the PicoSEO head embed in 1 click to inject Schema.org
                  Product, Offer, Brand & FAQ JSON-LD plus LCP hero image
                  preloading with 0.0 kB of JavaScript.
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

      {/* 3. Bento "Store SEO & AI Readiness Score" Hero Card */}
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
                    marginBottom: 4,
                  }}
                >
                  <span className="pico-pill pico-pill--blue">
                    {audit.store.storeName}
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
                  Store SEO & AI Readiness Score
                </h1>
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: 13,
                    color: "#475569",
                  }}
                >
                  Real-time audit across{" "}
                  <strong className="pico-tabular">
                    {audit.products.length}
                  </strong>{" "}
                  catalog products for Google Search snippets, Core Web Vitals
                  LCP, and AI citations (ChatGPT, Perplexity, Claude).
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
                    <SparklesIcon size={16} />
                    <span>
                      {isBulkRunning
                        ? "Optimizing catalog…"
                        : audit.productsNeedingFix > 0
                          ? `Fix All Products in 1 Click (${audit.productsNeedingFix})`
                          : "Fix All Products in 1 Click"}
                    </span>
                  </button>
                </bulkFetcher.Form>

                <Link to="/app/simulator" className="pico-btn pico-btn--secondary">
                  <RadarIcon size={16} />
                  <span>Open Speed Simulator</span>
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
                            ? "#10b981"
                            : item.pct >= 50
                              ? "#f59e0b"
                              : "#ef4444",
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

      {/* 4. Three KPI Tiles */}
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
              Products Audited & Optimized
            </span>
            <span
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: "#eff6ff",
                color: "#2563eb",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <SparklesIcon size={16} />
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
            {audit.settings.totalProductsOptimized} lifetime 1-click optimizations
            logged
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
              Missing Alt-Texts Repaired
            </span>
            <span
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: "#ecfdf5",
                color: "#059669",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ImageFrameIcon size={16} />
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
            {audit.settings.totalAltTextsFixed}
          </div>
          <div
            className="pico-tabular"
            style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}
          >
            {audit.missingAltTotal === 0
              ? "All catalog media nodes have descriptive alt text"
              : `${audit.missingAltTotal} media node(s) currently missing alt text`}
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
              Instant IndexNow Pings Sent
            </span>
            <span
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: "#fffbeb",
                color: "#d97706",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <GlobeSearchIcon size={16} />
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
            Real-time Bing, Yandex, Naver & ChatGPT Search indexation
          </div>
        </div>
      </section>

      {/* 5. Interactive Product SEO Audit Table */}
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
              Product SEO & AI Audit Table
            </h2>
            <p
              style={{
                margin: "3px 0 0",
                fontSize: 12.5,
                color: "#64748b",
              }}
            >
              Unfiltered catalog traversal across active, draft, and unindexed
              products with 300px proportional thumbnails.
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
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title, vendor, type…"
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
                <th>Detected Issues & Readiness</th>
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
                      ? "No products found in this store yet. Add products in Shopify Admin to audit and optimize them."
                      : "No products match the current filter."}
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                  const isRowOptimizing = activeRowProductId === product.id;
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
                              • {product.images.length} image
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
                          {product.status}
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
                              SEO & AI Ready
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
                            Inspect
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
                              className="pico-btn pico-btn--primary"
                              style={{ padding: "6px 12px", fontSize: 12 }}
                            >
                              <SparklesIcon size={13} />
                              <span>
                                {isRowOptimizing
                                  ? "Fixing…"
                                  : needsOptimization(product)
                                    ? "Optimize Now"
                                    : "Re-Sync SEO"}
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

      {/* Recent Optimization Log */}
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
              Recent optimization activity
            </h3>
            <span className="pico-pill pico-pill--info pico-tabular">
              Last {audit.recentLogs.length} events
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
                    • {log.altTextsUpdatedCount} alt(s)
                    {log.indexNowPinged ? " • IndexNow pinged" : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 6. Complete Your Store Revenue Suite Partner Footer */}
      <PartnerSuiteFooter />
    </div>
  );
}
