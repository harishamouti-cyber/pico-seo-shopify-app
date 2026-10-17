import { useMemo, useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { TitleBar } from "@shopify/app-bridge-react";
import {
  LiveStatusDot,
  ProductThumbnail,
  SpringSegmentedControl,
} from "../components/bento-primitives";
import {
  BotCitationIcon,
  CheckCircleIcon,
  CopyIcon,
  DesktopBezelIcon,
  FileMarkdownIcon,
  GlobeSearchIcon,
  MobileBezelIcon,
  PlusChipIcon,
  SparklesIcon,
} from "../components/icons";
import prisma from "../db.server";
import { buildLlmsDocument, toLlmsProduct } from "../lib/llms";
import {
  DEFAULT_TEMPLATES,
  formatPrice,
  generateAltTexts,
  generateMeta,
  META_DESCRIPTION_MAX,
  META_TITLE_MAX,
  productUrl,
  TEMPLATE_TOKENS,
} from "../lib/seo-template";
import { sanitizeStoreName } from "../lib/store-name";
import type { PicoProduct } from "../lib/types";
import { fetchCatalogAudit } from "../services/catalog-seo.server";
import { generateIndexNowKey } from "../services/indexnow.server";
import { ensureStoreInfrastructure } from "../services/settings.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const audit = await fetchCatalogAudit(admin, session.shop, 50);
  return json({ audit });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "save_settings");

  if (intent === "rotate_indexnow_key") {
    const updated = await prisma.picoSeoSettings.update({
      where: { shop: session.shop },
      data: { indexNowApiKey: generateIndexNowKey() },
    });
    await ensureStoreInfrastructure(admin, updated);
    return json({
      ok: true,
      message: "Generated a fresh IndexNow verification key and updated store redirects.",
    });
  }

  const rawStoreName = String(formData.get("storeDisplayName") || "").trim();
  const storeDisplayName = sanitizeStoreName(rawStoreName || session.shop);
  const metaTitleTemplate =
    String(formData.get("metaTitleTemplate") || "").trim() ||
    DEFAULT_TEMPLATES.metaTitleTemplate;
  const metaDescriptionTemplate =
    String(formData.get("metaDescriptionTemplate") || "").trim() ||
    DEFAULT_TEMPLATES.metaDescriptionTemplate;
  const imageAltTemplate =
    String(formData.get("imageAltTemplate") || "").trim() ||
    DEFAULT_TEMPLATES.imageAltTemplate;

  const autoSyncOnProductUpdate = formData.get("autoSyncOnProductUpdate") === "on";
  const enableJsonLdSchema = formData.get("enableJsonLdSchema") === "on";
  const enableLcpImagePreload = formData.get("enableLcpImagePreload") === "on";
  const enableLlmsTxtFeed = formData.get("enableLlmsTxtFeed") === "on";
  const enableIndexNowPing = formData.get("enableIndexNowPing") === "on";

  const updated = await prisma.picoSeoSettings.update({
    where: { shop: session.shop },
    data: {
      storeDisplayName,
      metaTitleTemplate,
      metaDescriptionTemplate,
      imageAltTemplate,
      autoSyncOnProductUpdate,
      enableJsonLdSchema,
      enableLcpImagePreload,
      enableLlmsTxtFeed,
      enableIndexNowPing,
    },
  });

  await ensureStoreInfrastructure(admin, updated);

  return json({
    ok: true,
    message:
      "Saved templates, automation toggles, and synced Zero-JS theme configuration.",
  });
};

type TemplateFieldKey =
  | "metaTitleTemplate"
  | "metaDescriptionTemplate"
  | "imageAltTemplate";

type PreviewViewMode = "google" | "ai" | "llms";
type BezelMode = "desktop" | "mobile";

const FALLBACK_SAMPLE_PRODUCT: PicoProduct = {
  id: "gid://shopify/Product/sample",
  title: "The Collection Snowboard: Liquid",
  handle: "the-collection-snowboard-liquid",
  status: "ACTIVE",
  vendor: "Hydrogen Vendor",
  productType: "Snowboard",
  tags: ["Winter", "Snow", "All-Mountain"],
  description:
    "Engineered for all-mountain precision with a sintered carbon base, responsive flex profile, and zero-chatter edge control.",
  onlineStoreUrl: null,
  totalInventory: 24,
  seoTitle: null,
  seoDescription: null,
  images: [],
  variants: [
    {
      id: "gid://shopify/ProductVariant/1",
      title: "158cm / Carbon",
      price: "749.95",
      sku: "PICO-SB-158",
      barcode: "012345678905",
      availableForSale: true,
      imageUrl: null,
    },
  ],
  primaryImageUrl: null,
  thumbnailUrl: null,
  minPrice: "749.95",
  maxPrice: "749.95",
};

const VARIABLE_CHIPS = [
  { token: "{{product_title}}", label: "+ Product Title" },
  { token: "{{variant_title}}", label: "+ Variant" },
  { token: "{{price}}", label: "+ Price" },
  { token: "{{store_name}}", label: "+ Store Name" },
  { token: "{{product_type}}", label: "+ Product Type" },
] as const;

export default function SettingsStudioRoute() {
  const { audit } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  const [storeDisplayName, setStoreDisplayName] = useState(
    audit.settings.storeDisplayName,
  );
  const [metaTitleTemplate, setMetaTitleTemplate] = useState(
    audit.settings.metaTitleTemplate,
  );
  const [metaDescriptionTemplate, setMetaDescriptionTemplate] = useState(
    audit.settings.metaDescriptionTemplate,
  );
  const [imageAltTemplate, setImageAltTemplate] = useState(
    audit.settings.imageAltTemplate,
  );

  const [autoSyncOnProductUpdate, setAutoSyncOnProductUpdate] = useState(
    audit.settings.autoSyncOnProductUpdate,
  );
  const [enableJsonLdSchema, setEnableJsonLdSchema] = useState(
    audit.settings.enableJsonLdSchema,
  );
  const [enableLcpImagePreload, setEnableLcpImagePreload] = useState(
    audit.settings.enableLcpImagePreload,
  );
  const [enableLlmsTxtFeed, setEnableLlmsTxtFeed] = useState(
    audit.settings.enableLlmsTxtFeed,
  );
  const [enableIndexNowPing, setEnableIndexNowPing] = useState(
    audit.settings.enableIndexNowPing,
  );

  const [activeField, setActiveField] =
    useState<TemplateFieldKey>("metaTitleTemplate");
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const descInputRef = useRef<HTMLTextAreaElement | null>(null);
  const altInputRef = useRef<HTMLInputElement | null>(null);

  const catalogProducts =
    audit.products.length > 0 ? audit.products : [FALLBACK_SAMPLE_PRODUCT];
  const [selectedProductId, setSelectedProductId] = useState(
    catalogProducts[0].id,
  );
  const [previewMode, setPreviewMode] = useState<PreviewViewMode>("google");
  const [bezelMode, setBezelMode] = useState<BezelMode>("desktop");
  const [copiedKey, setCopiedKey] = useState(false);

  const selectedProduct = useMemo(
    () =>
      catalogProducts.find((p) => p.id === selectedProductId) ??
      catalogProducts[0],
    [catalogProducts, selectedProductId],
  );

  const liveStoreContext = useMemo(
    () => ({
      ...audit.store,
      storeName: storeDisplayName.trim() || audit.store.storeName,
    }),
    [audit.store, storeDisplayName],
  );

  const liveMeta = useMemo(
    () =>
      generateMeta(selectedProduct, liveStoreContext, {
        metaTitleTemplate,
        metaDescriptionTemplate,
        imageAltTemplate,
      }),
    [
      selectedProduct,
      liveStoreContext,
      metaTitleTemplate,
      metaDescriptionTemplate,
      imageAltTemplate,
    ],
  );

  const liveAltPreview = useMemo(() => {
    const alts = generateAltTexts(
      selectedProduct,
      liveStoreContext,
      imageAltTemplate,
    );
    return (
      alts[0]?.alt ||
      generateMeta(selectedProduct, liveStoreContext, {
        metaTitleTemplate: imageAltTemplate,
        metaDescriptionTemplate,
        imageAltTemplate,
      }).title
    );
  }, [
    selectedProduct,
    liveStoreContext,
    imageAltTemplate,
    metaDescriptionTemplate,
  ]);

  const liveLlmsFeed = useMemo(() => {
    const items = catalogProducts
      .slice(0, 12)
      .map((p) => toLlmsProduct(p, liveStoreContext));
    return buildLlmsDocument(liveStoreContext, items);
  }, [catalogProducts, liveStoreContext]);

  const insertTokenIntoField = (
    token: string,
    targetField: TemplateFieldKey = activeField,
  ) => {
    const refMap = {
      metaTitleTemplate: titleInputRef.current,
      metaDescriptionTemplate: descInputRef.current,
      imageAltTemplate: altInputRef.current,
    };
    const setterMap = {
      metaTitleTemplate: setMetaTitleTemplate,
      metaDescriptionTemplate: setMetaDescriptionTemplate,
      imageAltTemplate: setImageAltTemplate,
    };
    const valueMap = {
      metaTitleTemplate,
      metaDescriptionTemplate,
      imageAltTemplate,
    };

    const el = refMap[targetField];
    const currentVal = valueMap[targetField];
    const setter = setterMap[targetField];

    if (el && typeof el.selectionStart === "number") {
      const start = el.selectionStart;
      const end = el.selectionEnd ?? start;
      const prefix = currentVal.slice(0, start);
      const suffix = currentVal.slice(end);
      const needsLeadingSpace =
        prefix.length > 0 && !/\s$/.test(prefix) ? " " : "";
      const next = `${prefix}${needsLeadingSpace}${token}${suffix}`;
      setter(next);
      requestAnimationFrame(() => {
        el.focus();
        const cursor = (prefix + needsLeadingSpace + token).length;
        el.setSelectionRange(cursor, cursor);
      });
    } else {
      setter(`${currentVal.trim()} ${token}`.trim());
    }
    setActiveField(targetField);
  };

  const handleCopy = (text: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 1800);
    } catch {
      // ignore
    }
  };

  const resolvedUrl = productUrl(selectedProduct, liveStoreContext);
  const priceFormatted = formatPrice(
    selectedProduct.minPrice,
    liveStoreContext.currencyCode,
  );
  const isAvailable = selectedProduct.variants.some((v) => v.availableForSale);

  return (
    <div className="pico-shell">
      <TitleBar title="Automation Studio & Live SERP Customizer" />

      {actionData?.message && (
        <div
          className="pico-bento-card"
          style={{
            marginBottom: 16,
            padding: "12px 18px",
            borderColor: "#a7f3d0",
            background: "#ecfdf5",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "#065f46",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <CheckCircleIcon size={17} />
            <span>{actionData.message}</span>
          </div>
          <span className="pico-pill pico-pill--success">Live</span>
        </div>
      )}

      <div className="pico-split-layout">
        {/* LEFT COLUMN: Smart Metadata & Alt-Text Templates + Engine Toggles */}
        <Form method="post" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <input type="hidden" name="intent" value="save_settings" />

          {/* Smart Metadata & Alt-Text Templates Card */}
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
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 16,
                    fontWeight: 600,
                    color: "#0f172a",
                  }}
                >
                  Smart metadata & alt-text templates
                </h2>
                <p
                  style={{
                    margin: "3px 0 0",
                    fontSize: 12.5,
                    color: "#64748b",
                  }}
                >
                  Click any variable chip to insert it directly into the active
                  template input.
                </p>
              </div>
              <span className="pico-pill pico-pill--blue">
                Active field:{" "}
                {activeField === "metaTitleTemplate"
                  ? "SEO Title"
                  : activeField === "metaDescriptionTemplate"
                    ? "Meta Description"
                    : "Image Alt"}
              </span>
            </div>

            {/* Global Clickable Dynamic Variable Chips Bar */}
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: "#475569",
                  marginBottom: 6,
                }}
              >
                Insert dynamic token into active input ({TEMPLATE_TOKENS.length}{" "}
                available):
              </div>
              <div className="pico-chip-row" style={{ marginTop: 0 }}>
                {VARIABLE_CHIPS.map((chip) => (
                  <button
                    key={chip.token}
                    type="button"
                    onClick={() => insertTokenIntoField(chip.token)}
                    className="pico-token-chip"
                  >
                    <PlusChipIcon size={12} />
                    <span>{chip.label.replace(/^\+\s*/, "")}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Store Display Name */}
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="storeDisplayName"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#0f172a",
                  marginBottom: 6,
                }}
              >
                <span>Sanitized Brand / Store Display Name</span>
                <span style={{ fontSize: 11.5, color: "#64748b", fontWeight: 500 }}>
                  Resolves {"{{store_name}}"}
                </span>
              </label>
              <input
                id="storeDisplayName"
                name="storeDisplayName"
                type="text"
                value={storeDisplayName}
                onChange={(e) => setStoreDisplayName(e.target.value)}
                className="pico-input"
              />
            </div>

            {/* Meta Title Template */}
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="metaTitleTemplate"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#0f172a",
                  marginBottom: 6,
                }}
              >
                <span>SEO Meta Title Template</span>
                <span
                  className="pico-tabular"
                  style={{ fontSize: 11.5, color: "#64748b", fontWeight: 500 }}
                >
                  Resolved: {liveMeta.title.length} / {META_TITLE_MAX} chars
                </span>
              </label>
              <input
                ref={titleInputRef}
                id="metaTitleTemplate"
                name="metaTitleTemplate"
                type="text"
                value={metaTitleTemplate}
                onFocus={() => setActiveField("metaTitleTemplate")}
                onChange={(e) => setMetaTitleTemplate(e.target.value)}
                className="pico-input"
              />
              <div className="pico-chip-row">
                {VARIABLE_CHIPS.map((chip) => (
                  <button
                    key={chip.token}
                    type="button"
                    onClick={() =>
                      insertTokenIntoField(chip.token, "metaTitleTemplate")
                    }
                    className="pico-token-chip"
                  >
                    <span>{chip.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Meta Description Template */}
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="metaDescriptionTemplate"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#0f172a",
                  marginBottom: 6,
                }}
              >
                <span>SEO Meta Description Template</span>
                <span
                  className="pico-tabular"
                  style={{ fontSize: 11.5, color: "#64748b", fontWeight: 500 }}
                >
                  Resolved: {liveMeta.description.length} / {META_DESCRIPTION_MAX}{" "}
                  chars
                </span>
              </label>
              <textarea
                ref={descInputRef}
                id="metaDescriptionTemplate"
                name="metaDescriptionTemplate"
                rows={3}
                value={metaDescriptionTemplate}
                onFocus={() => setActiveField("metaDescriptionTemplate")}
                onChange={(e) => setMetaDescriptionTemplate(e.target.value)}
                className="pico-textarea"
              />
              <div className="pico-chip-row">
                {VARIABLE_CHIPS.map((chip) => (
                  <button
                    key={chip.token}
                    type="button"
                    onClick={() =>
                      insertTokenIntoField(
                        chip.token,
                        "metaDescriptionTemplate",
                      )
                    }
                    className="pico-token-chip"
                  >
                    <span>{chip.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Image Alt-Text Template */}
            <div>
              <label
                htmlFor="imageAltTemplate"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#0f172a",
                  marginBottom: 6,
                }}
              >
                <span>Media Image Alt-Text Template</span>
                <span
                  className="pico-tabular"
                  style={{ fontSize: 11.5, color: "#64748b", fontWeight: 500 }}
                >
                  Resolved: {liveAltPreview.length} / 125 chars
                </span>
              </label>
              <input
                ref={altInputRef}
                id="imageAltTemplate"
                name="imageAltTemplate"
                type="text"
                value={imageAltTemplate}
                onFocus={() => setActiveField("imageAltTemplate")}
                onChange={(e) => setImageAltTemplate(e.target.value)}
                className="pico-input"
              />
              <div className="pico-chip-row">
                {VARIABLE_CHIPS.map((chip) => (
                  <button
                    key={chip.token}
                    type="button"
                    onClick={() =>
                      insertTokenIntoField(chip.token, "imageAltTemplate")
                    }
                    className="pico-token-chip"
                  >
                    <span>{chip.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Zero-JS Storefront & AI Indexation Toggles Card */}
          <section className="pico-bento-card">
            <h2
              style={{
                margin: "0 0 4px",
                fontSize: 16,
                fontWeight: 600,
                color: "#0f172a",
              }}
            >
              Zero-JS schema, CWV & AI crawler automation
            </h2>
            <p
              style={{
                margin: "0 0 14px",
                fontSize: 12.5,
                color: "#64748b",
              }}
            >
              All storefront injections execute in pure Shopify Liquid with 0.0
              kB of client-side JavaScript.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                {
                  name: "enableJsonLdSchema",
                  checked: enableJsonLdSchema,
                  onChange: setEnableJsonLdSchema,
                  title: "JSON-LD Schema Injection (Product, Offer, Brand & FAQPage)",
                  desc: "Injects structured data into the document head for Google Rich Results and AI answer engines.",
                },
                {
                  name: "enableLcpImagePreload",
                  checked: enableLcpImagePreload,
                  onChange: setEnableLcpImagePreload,
                  title: "LCP Hero Image Preloading (Core Web Vitals)",
                  desc: 'Injects <link rel="preload" as="image" fetchpriority="high"> with responsive srcset on product pages.',
                },
                {
                  name: "enableLlmsTxtFeed",
                  checked: enableLlmsTxtFeed,
                  onChange: setEnableLlmsTxtFeed,
                  title: "Automated /llms.txt AI Crawler Feed",
                  desc: "Publishes a structured Markdown catalog summary for ChatGPT, Perplexity, and Claude citations.",
                },
                {
                  name: "enableIndexNowPing",
                  checked: enableIndexNowPing,
                  onChange: setEnableIndexNowPing,
                  title: "Instant IndexNow Search Engine Pinging",
                  desc: "Pings api.indexnow.org whenever products are optimized or updated via Shopify webhooks.",
                },
                {
                  name: "autoSyncOnProductUpdate",
                  checked: autoSyncOnProductUpdate,
                  onChange: setAutoSyncOnProductUpdate,
                  title: "Auto-Optimize Missing SEO on Product Update Webhook",
                  desc: "Automatically populates missing SEO titles, meta descriptions, and alt texts when new products are saved.",
                },
              ].map((toggle) => (
                <label
                  key={toggle.name}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 14,
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    background: toggle.checked ? "#f8fafc" : "#ffffff",
                    cursor: "pointer",
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 13.5,
                        fontWeight: 600,
                        color: "#0f172a",
                      }}
                    >
                      <LiveStatusDot
                        tone={toggle.checked ? "live" : "muted"}
                      />
                      <span>{toggle.title}</span>
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#64748b",
                        marginTop: 3,
                        paddingLeft: 16,
                      }}
                    >
                      {toggle.desc}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    name={toggle.name}
                    checked={toggle.checked}
                    onChange={(e) => toggle.onChange(e.target.checked)}
                    style={{
                      width: 18,
                      height: 18,
                      marginTop: 2,
                      accentColor: "#2563eb",
                      cursor: "pointer",
                    }}
                  />
                </label>
              ))}
            </div>

            {/* IndexNow Verification Key Box */}
            <div
              style={{
                marginTop: 14,
                padding: "12px 14px",
                borderRadius: 12,
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#334155",
                  }}
                >
                  IndexNow Protocol API Key
                </div>
                <code
                  className="pico-tabular"
                  style={{
                    fontSize: 12,
                    color: "#0f172a",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  }}
                >
                  {audit.settings.indexNowApiKey || "Auto-generated on save"}
                </code>
              </div>
              {audit.settings.indexNowApiKey && (
                <button
                  type="button"
                  onClick={() => handleCopy(audit.settings.indexNowApiKey || "")}
                  className="pico-btn pico-btn--secondary"
                  style={{ padding: "5px 10px", fontSize: 12 }}
                >
                  <CopyIcon size={13} />
                  <span>{copiedKey ? "Copied" : "Copy Key"}</span>
                </button>
              )}
            </div>

            <div
              style={{
                marginTop: 18,
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setMetaTitleTemplate(DEFAULT_TEMPLATES.metaTitleTemplate);
                  setMetaDescriptionTemplate(
                    DEFAULT_TEMPLATES.metaDescriptionTemplate,
                  );
                  setImageAltTemplate(DEFAULT_TEMPLATES.imageAltTemplate);
                }}
                className="pico-btn pico-btn--secondary"
              >
                Reset to defaults
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="pico-btn pico-btn--primary"
              >
                <SparklesIcon size={15} />
                <span>{isSaving ? "Saving…" : "Save Automation & Templates"}</span>
              </button>
            </div>
          </section>
        </Form>

        {/* RIGHT COLUMN: Sticky Live SERP, AI Answer Engine & /llms.txt Preview */}
        <aside className="pico-sticky-preview">
          <div className="pico-bento-card">
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                marginBottom: 12,
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 15.5,
                    fontWeight: 600,
                    color: "#0f172a",
                  }}
                >
                  Live Search & AI Citation Preview
                </h2>
                <p
                  style={{
                    margin: "2px 0 0",
                    fontSize: 12,
                    color: "#64748b",
                  }}
                >
                  Real-time token resolution against your store catalog.
                </p>
              </div>

              {/* Desktop / Mobile Bezel Switcher */}
              <SpringSegmentedControl<BezelMode>
                ariaLabel="Device bezel"
                value={bezelMode}
                onChange={setBezelMode}
                options={[
                  {
                    value: "desktop",
                    label: "Desktop",
                    icon: <DesktopBezelIcon size={14} />,
                  },
                  {
                    value: "mobile",
                    label: "Mobile",
                    icon: <MobileBezelIcon size={14} />,
                  },
                ]}
              />
            </div>

            {/* Real Catalog Product Selector Dropdown */}
            <div style={{ marginBottom: 12 }}>
              <label
                htmlFor="previewProductSelect"
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#475569",
                  marginBottom: 5,
                }}
              >
                Preview with catalog product:
              </label>
              <select
                id="previewProductSelect"
                value={selectedProduct.id}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="pico-select"
              >
                {catalogProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.title} (
                    {formatPrice(product.minPrice, liveStoreContext.currencyCode)}
                    )
                  </option>
                ))}
              </select>
            </div>

            {/* Fluid Segmented Preview Mode Toggles */}
            <div style={{ marginBottom: 14, overflowX: "auto" }}>
              <SpringSegmentedControl<PreviewViewMode>
                ariaLabel="Preview mode"
                value={previewMode}
                onChange={setPreviewMode}
                options={[
                  {
                    value: "google",
                    label: "Google Search Snippet View",
                    icon: <GlobeSearchIcon size={14} />,
                  },
                  {
                    value: "ai",
                    label: "AI Answer Engine Citation View (ChatGPT / Perplexity)",
                    icon: <BotCitationIcon size={14} />,
                  },
                  {
                    value: "llms",
                    label: "Raw /llms.txt Feed View",
                    icon: <FileMarkdownIcon size={14} />,
                  },
                ]}
              />
            </div>

            {/* Device Bezel Stage with Spring-Physics Transition */}
            <div
              className={`pico-bezel-frame ${
                bezelMode === "mobile"
                  ? "pico-bezel-frame--mobile"
                  : "pico-bezel-frame--desktop"
              }`}
            >
              {/* Browser / Bezel Top Chrome */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  background: "#f8fafc",
                  borderBottom: "1px solid #e2e8f0",
                  fontSize: 11.5,
                  color: "#64748b",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 99,
                      background: "#cbd5e1",
                    }}
                  />
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 99,
                      background: "#cbd5e1",
                    }}
                  />
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 99,
                      background: "#cbd5e1",
                    }}
                  />
                </div>
                <span
                  style={{
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: bezelMode === "mobile" ? 200 : 320,
                  }}
                >
                  {previewMode === "google"
                    ? "google.com/search"
                    : previewMode === "ai"
                      ? "perplexity.ai • chatgpt.com"
                      : `${liveStoreContext.host}/llms.txt`}
                </span>
                <span className="pico-tabular" style={{ fontWeight: 600 }}>
                  {bezelMode === "mobile" ? "390px" : "1280px"}
                </span>
              </div>

              {/* Animated Content Stage */}
              <div
                key={`${previewMode}-${bezelMode}-${selectedProduct.id}`}
                className="pico-spring-stage"
                style={{ padding: 18 }}
              >
                {previewMode === "google" && (
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        marginBottom: 8,
                      }}
                    >
                      <div
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 999,
                          background: "#eff6ff",
                          color: "#1d4ed8",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {liveStoreContext.storeName.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#202124",
                          }}
                        >
                          {liveStoreContext.storeName}
                        </div>
                        <div
                          style={{
                            fontSize: 11.5,
                            color: "#4d5156",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          https://{liveStoreContext.host} › products ›{" "}
                          {selectedProduct.handle}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: 14,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: bezelMode === "mobile" ? 16 : 18,
                            fontWeight: 500,
                            color: "#1a0dab",
                            lineHeight: 1.3,
                            marginBottom: 6,
                          }}
                        >
                          {liveMeta.title}
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: "#4d5156",
                            lineHeight: 1.5,
                          }}
                        >
                          {liveMeta.description}
                        </div>
                        <div
                          className="pico-tabular"
                          style={{
                            marginTop: 8,
                            fontSize: 12,
                            color: "#0f172a",
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 8,
                            alignItems: "center",
                          }}
                        >
                          <span style={{ color: "#f59e0b", fontWeight: 700 }}>
                            ★★★★★
                          </span>
                          <span style={{ fontWeight: 600 }}>{priceFormatted}</span>
                          <span>•</span>
                          <span
                            style={{
                              color: isAvailable ? "#047857" : "#b45309",
                              fontWeight: 600,
                            }}
                          >
                            {isAvailable ? "In stock" : "Out of stock"}
                          </span>
                        </div>
                      </div>

                      <ProductThumbnail
                        src={selectedProduct.thumbnailUrl}
                        alt={liveAltPreview}
                        large
                      />
                    </div>

                    <div
                      style={{
                        marginTop: 14,
                        paddingTop: 12,
                        borderTop: "1px dashed #e2e8f0",
                        fontSize: 12,
                        color: "#475569",
                      }}
                    >
                      <strong>Resolved image alt text:</strong>{" "}
                      <code
                        style={{
                          background: "#f1f5f9",
                          padding: "2px 6px",
                          borderRadius: 6,
                          color: "#0f172a",
                        }}
                      >
                        {liveAltPreview}
                      </code>
                    </div>
                  </div>
                )}

                {previewMode === "ai" && (
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 10,
                      }}
                    >
                      <span className="pico-pill pico-pill--blue">
                        <BotCitationIcon size={13} />
                        AI Answer Engine Citation
                      </span>
                      <span
                        style={{
                          fontSize: 11.5,
                          color: "#64748b",
                        }}
                      >
                        Powered by JSON-LD + /llms.txt
                      </span>
                    </div>

                    <div
                      style={{
                        padding: "12px 14px",
                        borderRadius: 12,
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        marginBottom: 12,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13,
                          lineHeight: 1.55,
                          color: "#0f172a",
                        }}
                      >
                        <strong>{selectedProduct.title}</strong> is available
                        from <strong>{liveStoreContext.storeName}</strong> for{" "}
                        <strong className="pico-tabular">
                          {priceFormatted}
                        </strong>{" "}
                        ({isAvailable ? "currently in stock" : "out of stock"}).{" "}
                        {liveMeta.description}{" "}
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "1px 6px",
                            borderRadius: 6,
                            background: "#dbeafe",
                            color: "#1d4ed8",
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          [1] {liveStoreContext.host}
                        </span>
                      </div>
                    </div>

                    {/* Cited Source Card */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #cbd5e1",
                        background: "#ffffff",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          minWidth: 0,
                        }}
                      >
                        <ProductThumbnail
                          src={selectedProduct.thumbnailUrl}
                          alt={liveAltPreview}
                        />
                        <div style={{ minWidth: 0 }}>
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
                            {liveMeta.title}
                          </div>
                          <div
                            style={{
                              fontSize: 11.5,
                              color: "#64748b",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {resolvedUrl}
                          </div>
                        </div>
                      </div>
                      <span className="pico-pill pico-pill--success pico-tabular">
                        {priceFormatted}
                      </span>
                    </div>
                  </div>
                )}

                {previewMode === "llms" && (
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 8,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#334155",
                        }}
                      >
                        /llms.txt Markdown feed ({catalogProducts.length}{" "}
                        products)
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(liveLlmsFeed)}
                        className="pico-btn pico-btn--secondary"
                        style={{ padding: "4px 9px", fontSize: 11.5 }}
                      >
                        <CopyIcon size={12} />
                        <span>Copy Markdown</span>
                      </button>
                    </div>
                    <pre className="pico-code-block">{liveLlmsFeed}</pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
