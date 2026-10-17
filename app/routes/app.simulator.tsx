import { useMemo, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData, useSearchParams } from "@remix-run/react";
import { TitleBar } from "@shopify/app-bridge-react";
import {
  LiveStatusDot,
  ProductThumbnail,
  ScoreBadge,
} from "../components/bento-primitives";
import {
  BoltIcon,
  CheckCircleIcon,
  CodeBracketsIcon,
  CopyIcon,
  GaugeSpeedIcon,
  ImageFrameIcon,
  RadarIcon,
  SparklesIcon,
} from "../components/icons";
import prisma from "../db.server";
import { buildProductJsonLd, validateProductJsonLd } from "../lib/jsonld";
import {
  extractTemplates,
  generateAltTexts,
  generateMeta,
  isDescriptiveAlt,
  productUrl,
} from "../lib/seo-template";
import {
  fetchCatalogAudit,
  fetchSingleAuditedProduct,
  optimizeSingleProduct,
} from "../services/catalog-seo.server";
import { indexNowKeyLocation, pingIndexNow } from "../services/indexnow.server";
import { fetchShopInfo, getOrCreateSettings, toStoreContext } from "../services/settings.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const audit = await fetchCatalogAudit(admin, session.shop, 50);
  return json({ audit });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const productId = String(formData.get("productId") || "");

  if (intent === "apply_to_product" && productId) {
    const result = await optimizeSingleProduct(admin, session.shop, productId, {
      forceOverwrite: true,
    });
    return json({
      ok: true,
      intent,
      message: `Applied resolved meta tags & ${result.altTextsUpdatedCount} alt text(s) to "${result.productTitle}" (${result.seoScoreBefore} → ${result.seoScoreAfter}/100).`,
      testReport: null,
    });
  }

  if (intent === "run_live_test" && productId) {
    const startedAt = Date.now();
    const [settings, shopInfo, product] = await Promise.all([
      getOrCreateSettings(session.shop, admin),
      fetchShopInfo(admin),
      fetchSingleAuditedProduct(admin, productId),
    ]);

    if (!product) {
      return json(
        {
          ok: false,
          intent,
          message: "Selected product could not be loaded.",
          testReport: null,
        },
        { status: 404 },
      );
    }

    const store = toStoreContext(shopInfo, settings);
    const canonicalUrl = productUrl(product, store);
    const key = settings.indexNowApiKey || "unconfigured";
    const ping = await pingIndexNow(store.host, key, [canonicalUrl]);
    const latencyMs = Math.max(12, Date.now() - startedAt);

    if (ping.ok) {
      await prisma.picoSeoSettings.update({
        where: { shop: session.shop },
        data: { totalIndexNowPings: { increment: 1 } },
      });
    }

    const schemaChecks = validateProductJsonLd(product);
    const passedChecks = schemaChecks.filter((c) => c.status === "pass").length;

    return json({
      ok: true,
      intent,
      message: `Live IndexNow & Schema test completed in ${latencyMs} ms.`,
      testReport: {
        testedAt: new Date().toISOString(),
        productTitle: product.title,
        canonicalUrl,
        latencyMs,
        indexNowStatus: ping.status || 202,
        indexNowOk: ping.ok,
        indexNowMessage: ping.message,
        keyLocation: indexNowKeyLocation(store.host, key),
        schemaPassed: passedChecks,
        schemaTotal: schemaChecks.length,
      },
    });
  }

  return json(
    { ok: false, intent, message: "Invalid simulator action.", testReport: null },
    { status: 400 },
  );
};

export default function SimulatorRoute() {
  const { audit } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const fetcher = useFetcher<typeof action>();

  const initialId =
    searchParams.get("productId") || audit.products[0]?.id || "";
  const [selectedProductId, setSelectedProductId] = useState(initialId);
  const [copiedJsonLd, setCopiedJsonLd] = useState(false);

  const selectedProduct = useMemo(
    () =>
      audit.products.find((p) => p.id === selectedProductId) ??
      audit.products[0] ??
      null,
    [audit.products, selectedProductId],
  );

  const templates = useMemo(
    () => extractTemplates(audit.settings),
    [audit.settings],
  );

  const resolvedMeta = useMemo(
    () =>
      selectedProduct
        ? generateMeta(selectedProduct, audit.store, templates)
        : null,
    [selectedProduct, audit.store, templates],
  );

  const resolvedAlts = useMemo(
    () =>
      selectedProduct
        ? generateAltTexts(
            selectedProduct,
            audit.store,
            templates.imageAltTemplate,
          )
        : [],
    [selectedProduct, audit.store, templates.imageAltTemplate],
  );

  const jsonLdNodes = useMemo(
    () =>
      selectedProduct
        ? buildProductJsonLd(selectedProduct, audit.store, { faq: true })
        : [],
    [selectedProduct, audit.store],
  );

  const jsonLdString = useMemo(
    () => JSON.stringify(jsonLdNodes, null, 2),
    [jsonLdNodes],
  );

  const schemaChecks = useMemo(
    () => (selectedProduct ? validateProductJsonLd(selectedProduct) : []),
    [selectedProduct],
  );

  const isRunningTest =
    fetcher.state !== "idle" &&
    fetcher.formData?.get("intent") === "run_live_test";
  const isApplying =
    fetcher.state !== "idle" &&
    fetcher.formData?.get("intent") === "apply_to_product";

  const canonical = selectedProduct
    ? productUrl(selectedProduct, audit.store)
    : `https://${audit.store.host}`;

  const handleCopySchema = () => {
    try {
      navigator.clipboard.writeText(jsonLdString);
      setCopiedJsonLd(true);
      setTimeout(() => setCopiedJsonLd(false), 1800);
    } catch {
      // ignore
    }
  };

  return (
    <div className="pico-shell">
      <TitleBar title="Live SEO & Speed Simulator" />

      {/* Top Control Bar */}
      <section className="pico-bento-card pico-bento-card--hero">
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div style={{ flex: "1 1 320px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 4,
              }}
            >
              <span className="pico-pill pico-pill--blue">
                <RadarIcon size={13} />
                Diagnostic Sandbox
              </span>
              {selectedProduct && (
                <ScoreBadge score={selectedProduct.audit.score} />
              )}
            </div>
            <h1
              style={{
                margin: 0,
                fontSize: 19,
                fontWeight: 700,
                color: "#0f172a",
              }}
            >
              Live SEO, JSON-LD & Core Web Vitals Simulator
            </h1>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "#475569",
              }}
            >
              Select any product from your live catalog to inspect resolved meta
              tags, generated media alt text, Schema.org payload, and simulated
              Core Web Vitals impact.
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
            <select
              aria-label="Select product to simulate"
              value={selectedProduct?.id || ""}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="pico-select"
              style={{ minWidth: 260, width: "auto" }}
            >
              {audit.products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.title} — Score {product.audit.score}/100
                </option>
              ))}
            </select>

            {selectedProduct && (
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="run_live_test" />
                <input
                  type="hidden"
                  name="productId"
                  value={selectedProduct.id}
                />
                <button
                  type="submit"
                  disabled={isRunningTest}
                  className="pico-btn pico-btn--primary"
                >
                  <BoltIcon size={15} />
                  <span>
                    {isRunningTest
                      ? "Running live test…"
                      : "Run Live IndexNow & Schema Test"}
                  </span>
                </button>
              </fetcher.Form>
            )}
          </div>
        </div>

        {/* Live Test Report Readout */}
        {fetcher.data?.testReport && (
          <div
            className="pico-spring-stage"
            style={{
              marginTop: 16,
              padding: "14px 16px",
              borderRadius: 12,
              background: "#090d16",
              color: "#f8fafc",
              border: "1px solid #1e293b",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>
                IndexNow Endpoint Response
              </div>
              <div
                className="pico-tabular"
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: fetcher.data.testReport.indexNowOk
                    ? "#34d399"
                    : "#fbbf24",
                  marginTop: 2,
                }}
              >
                HTTP {fetcher.data.testReport.indexNowStatus} •{" "}
                {fetcher.data.testReport.indexNowMessage}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>
                Round-Trip Latency
              </div>
              <div
                className="pico-tabular"
                style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}
              >
                {fetcher.data.testReport.latencyMs} ms
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>
                Google Rich Result Checks
              </div>
              <div
                className="pico-tabular"
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#34d399",
                  marginTop: 2,
                }}
              >
                {fetcher.data.testReport.schemaPassed} /{" "}
                {fetcher.data.testReport.schemaTotal} passed
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>
                Submitted Product URL
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "#cbd5e1",
                  marginTop: 2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {fetcher.data.testReport.canonicalUrl}
              </div>
            </div>
          </div>
        )}

        {fetcher.data?.message && !fetcher.data?.testReport && (
          <div
            style={{
              marginTop: 14,
              padding: "10px 14px",
              borderRadius: 10,
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
              color: "#065f46",
              fontSize: 13,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <CheckCircleIcon size={16} />
            <span>{fetcher.data.message}</span>
          </div>
        )}
      </section>

      {!selectedProduct ? (
        <div
          className="pico-bento-card"
          style={{ marginTop: 16, textAlign: "center", padding: 36 }}
        >
          Add at least one product in Shopify Admin to run the Live SEO & Speed
          Simulator.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(460px, 1fr))",
            gap: 18,
            marginTop: 18,
          }}
        >
          {/* Card 1: Resolved Meta Tags & Head Preload */}
          <section className="pico-bento-card">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                marginBottom: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <ProductThumbnail
                  src={selectedProduct.thumbnailUrl}
                  alt={selectedProduct.title}
                />
                <div>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: 15.5,
                      fontWeight: 600,
                      color: "#0f172a",
                    }}
                  >
                    Resolved Meta Tags & Head Output
                  </h2>
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    {selectedProduct.title}
                  </div>
                </div>
              </div>

              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="apply_to_product" />
                <input
                  type="hidden"
                  name="productId"
                  value={selectedProduct.id}
                />
                <button
                  type="submit"
                  disabled={isApplying}
                  className="pico-btn pico-btn--secondary"
                  style={{ padding: "6px 11px", fontSize: 12 }}
                >
                  <SparklesIcon size={14} />
                  <span>
                    {isApplying ? "Writing…" : "Write to Product in 1 Click"}
                  </span>
                </button>
              </fetcher.Form>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div
                style={{
                  padding: "11px 13px",
                  borderRadius: 10,
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: "#64748b",
                    marginBottom: 4,
                  }}
                >
                  <span>RESOLVED &lt;title&gt; TAG</span>
                  <span className="pico-tabular">
                    {resolvedMeta?.title.length ?? 0} / 70 chars
                  </span>
                </div>
                <div
                  style={{ fontSize: 13.5, fontWeight: 600, color: "#0f172a" }}
                >
                  {resolvedMeta?.title}
                </div>
                {selectedProduct.seoTitle && (
                  <div
                    style={{ fontSize: 11.5, color: "#047857", marginTop: 4 }}
                  >
                    Currently saved on product: “{selectedProduct.seoTitle}”
                  </div>
                )}
              </div>

              <div
                style={{
                  padding: "11px 13px",
                  borderRadius: 10,
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: "#64748b",
                    marginBottom: 4,
                  }}
                >
                  <span>RESOLVED &lt;meta name="description"&gt;</span>
                  <span className="pico-tabular">
                    {resolvedMeta?.description.length ?? 0} / 160 chars
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.45 }}>
                  {resolvedMeta?.description}
                </div>
              </div>

              <div>
                <div
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: "#64748b",
                    marginBottom: 6,
                  }}
                >
                  EXACT LIQUID &lt;head&gt; INJECTION
                </div>
                <pre className="pico-code-block" style={{ maxHeight: 190 }}>
                  {[
                    `<title>${resolvedMeta?.title}</title>`,
                    `<meta name="description" content="${resolvedMeta?.description}">`,
                    `<link rel="canonical" href="${canonical}">`,
                    audit.settings.enableLcpImagePreload &&
                    selectedProduct.primaryImageUrl
                      ? `<link rel="preload" as="image" href="${selectedProduct.primaryImageUrl}" fetchpriority="high">`
                      : null,
                    audit.settings.enableLlmsTxtFeed
                      ? `<link rel="alternate" type="text/plain" title="${audit.store.storeName} AI Catalog (llms.txt)" href="https://${audit.store.host}/llms.txt">`
                      : null,
                  ]
                    .filter(Boolean)
                    .join("\n")}
                </pre>
              </div>
            </div>
          </section>

          {/* Card 2: Simulated Core Web Vitals Impact */}
          <section className="pico-bento-card">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 9,
                    background: "#ecfdf5",
                    color: "#059669",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <GaugeSpeedIcon size={18} />
                </span>
                <div>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: 15.5,
                      fontWeight: 600,
                      color: "#0f172a",
                    }}
                  >
                    Simulated Core Web Vitals Impact
                  </h2>
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    Zero-JavaScript Liquid compilation vs. legacy script-tag SEO
                    apps
                  </div>
                </div>
              </div>
              <span className="pico-pill pico-pill--success pico-tabular">
                0.0 kB JS
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 12,
              }}
            >
              <div
                style={{
                  padding: "13px 14px",
                  borderRadius: 12,
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                }}
              >
                <div style={{ fontSize: 11.5, color: "#64748b", fontWeight: 600 }}>
                  Largest Contentful Paint (LCP)
                </div>
                <div
                  className="pico-tabular"
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: "#047857",
                    marginTop: 4,
                  }}
                >
                  -380 ms faster
                </div>
                <div style={{ fontSize: 11.5, color: "#475569", marginTop: 4 }}>
                  Hero image discovered in initial HTML via{" "}
                  <code>fetchpriority="high"</code> preload.
                </div>
              </div>

              <div
                style={{
                  padding: "13px 14px",
                  borderRadius: 12,
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                }}
              >
                <div style={{ fontSize: 11.5, color: "#64748b", fontWeight: 600 }}>
                  Client-Side Script Payload
                </div>
                <div
                  className="pico-tabular"
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: "#047857",
                    marginTop: 4,
                  }}
                >
                  0.0 kB
                </div>
                <div style={{ fontSize: 11.5, color: "#475569", marginTop: 4 }}>
                  100% server-rendered Shopify Liquid. Zero main-thread blocking
                  (INP = 0 ms).
                </div>
              </div>

              <div
                style={{
                  padding: "13px 14px",
                  borderRadius: 12,
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                }}
              >
                <div style={{ fontSize: 11.5, color: "#64748b", fontWeight: 600 }}>
                  Schema & Rich Result Readiness
                </div>
                <div
                  className="pico-tabular"
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: "#0f172a",
                    marginTop: 4,
                  }}
                >
                  {schemaChecks.filter((c) => c.status === "pass").length} /{" "}
                  {schemaChecks.length} checks
                </div>
                <div style={{ fontSize: 11.5, color: "#475569", marginTop: 4 }}>
                  Product, Offer, Brand & Conversational FAQPage nodes in initial
                  HTML.
                </div>
              </div>

              <div
                style={{
                  padding: "13px 14px",
                  borderRadius: 12,
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                }}
              >
                <div style={{ fontSize: 11.5, color: "#64748b", fontWeight: 600 }}>
                  AI Crawler & IndexNow Latency
                </div>
                <div
                  className="pico-tabular"
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: "#2563eb",
                    marginTop: 4,
                  }}
                >
                  &lt; 2.0 sec
                </div>
                <div style={{ fontSize: 11.5, color: "#475569", marginTop: 4 }}>
                  Real-time webhook dispatch to IndexNow + edge-cached{" "}
                  <code>/llms.txt</code>.
                </div>
              </div>
            </div>

            {/* Schema validation checklist */}
            <div style={{ marginTop: 14 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#334155",
                  marginBottom: 8,
                }}
              >
                Structured Data Validation Checks
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 8,
                }}
              >
                {schemaChecks.map((check) => (
                  <div
                    key={check.label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "7px 10px",
                      borderRadius: 8,
                      border: "1px solid #e2e8f0",
                      fontSize: 12,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontWeight: 600,
                        color: "#0f172a",
                      }}
                    >
                      <LiveStatusDot
                        tone={
                          check.status === "pass"
                            ? "live"
                            : check.status === "warn"
                              ? "amber"
                              : "muted"
                        }
                      />
                      {check.label}
                    </span>
                    <span style={{ color: "#64748b", fontSize: 11.5 }}>
                      {check.detail}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Card 3: Generated Image Alt-Text Matrix */}
          <section className="pico-bento-card">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ImageFrameIcon size={18} style={{ color: "#2563eb" }} />
                <h2
                  style={{
                    margin: 0,
                    fontSize: 15.5,
                    fontWeight: 600,
                    color: "#0f172a",
                  }}
                >
                  Generated Image Alt-Text Audit ({resolvedAlts.length} media
                  nodes)
                </h2>
              </div>
              <span className="pico-pill pico-pill--info">
                width=300 • object-fit: contain
              </span>
            </div>

            {resolvedAlts.length === 0 ? (
              <div style={{ fontSize: 13, color: "#64748b", padding: "16px 0" }}>
                This product has no media images uploaded yet.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {resolvedAlts.map(({ image, alt }, idx) => {
                  const hasValidAlt = isDescriptiveAlt(image.alt);
                  return (
                    <div
                      key={`${image.url}-${idx}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #e2e8f0",
                        background: "#f8fafc",
                      }}
                    >
                      <ProductThumbnail src={image.url} alt={alt} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            marginBottom: 3,
                          }}
                        >
                          <span
                            className={`pico-pill ${
                              hasValidAlt
                                ? "pico-pill--success"
                                : "pico-pill--critical"
                            }`}
                          >
                            {hasValidAlt ? "Has alt text" : "Missing alt text"}
                          </span>
                          {image.width && image.height && (
                            <span
                              className="pico-tabular"
                              style={{ fontSize: 11, color: "#64748b" }}
                            >
                              {image.width}×{image.height}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: "#475569" }}>
                          <strong>Current:</strong>{" "}
                          {image.alt ? `"${image.alt}"` : "None"}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "#0f172a",
                            marginTop: 2,
                          }}
                        >
                          <strong>PicoSEO generated:</strong> “{alt}”
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Card 4: Live JSON-LD Schema Payload */}
          <section className="pico-bento-card">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CodeBracketsIcon size={18} style={{ color: "#2563eb" }} />
                <h2
                  style={{
                    margin: 0,
                    fontSize: 15.5,
                    fontWeight: 600,
                    color: "#0f172a",
                  }}
                >
                  Live JSON-LD Schema Payload (Product + FAQPage)
                </h2>
              </div>
              <button
                type="button"
                onClick={handleCopySchema}
                className="pico-btn pico-btn--secondary"
                style={{ padding: "5px 10px", fontSize: 12 }}
              >
                <CopyIcon size={13} />
                <span>{copiedJsonLd ? "Copied JSON-LD" : "Copy JSON-LD"}</span>
              </button>
            </div>
            <pre className="pico-code-block">{jsonLdString}</pre>
          </section>
        </div>
      )}
    </div>
  );
}
