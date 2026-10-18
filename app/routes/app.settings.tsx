import { useMemo, useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { TitleBar } from "@shopify/app-bridge-react";
import {
  ProductThumbnail,
  SpringSegmentedControl,
  WatermelonToggle,
} from "../components/bento-primitives";
import {
  BotCitationIcon,
  CheckCircleIcon,
  CheckIcon,
  DesktopBezelIcon,
  ExternalArrowIcon,
  GaugeSpeedIcon,
  GlobeSearchIcon,
  MobileBezelIcon,
  PlusChipIcon,
  RadarIcon,
} from "../components/icons";
import prisma from "../db.server";
import {
  DEFAULT_TEMPLATES,
  formatPrice,
  generateAltTexts,
  generateMeta,
  META_DESCRIPTION_MAX,
  META_TITLE_MAX,
  productUrl,
} from "../lib/seo-template";
import { formatStoreDomain, sanitizeStoreName } from "../lib/store-name";
import type { PicoProduct } from "../lib/types";
import { fetchCatalogAudit } from "../services/catalog-seo.server";
import { generateIndexNowKey } from "../services/indexnow.server";
import { ensureStoreInfrastructure } from "../services/settings.server";
import { authenticate } from "../shopify.server";

export const TOKEN_PAIRS = [
  { display: "[Product Name]", raw: "{{product_title}}" },
  { display: "[Variant]", raw: "{{variant_title}}" },
  { display: "[Price]", raw: "{{price}}" },
  { display: "[Store Name]", raw: "{{store_name}}" },
  { display: "[Category]", raw: "{{product_type}}" },
] as const;

export function toDisplayTemplate(str: string): string {
  let out = str;
  for (const { display, raw } of TOKEN_PAIRS) {
    out = out.split(raw).join(display);
  }
  return out;
}

export function toDbTemplate(str: string): string {
  let out = str;
  for (const { display, raw } of TOKEN_PAIRS) {
    out = out.split(display).join(raw);
  }
  return out;
}

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
      message: "Updated your instant search engine connection.",
    });
  }

  const rawStoreName = String(formData.get("storeDisplayName") || "").trim();
  const storeDisplayName = sanitizeStoreName(rawStoreName || session.shop);
  const rawMetaTitle = String(formData.get("metaTitleTemplate") || "").trim();
  const metaTitleTemplate =
    (rawMetaTitle ? toDbTemplate(rawMetaTitle) : "") ||
    DEFAULT_TEMPLATES.metaTitleTemplate;

  const rawMetaDesc = String(formData.get("metaDescriptionTemplate") || "").trim();
  const metaDescriptionTemplate =
    (rawMetaDesc ? toDbTemplate(rawMetaDesc) : "") ||
    DEFAULT_TEMPLATES.metaDescriptionTemplate;

  const rawImageAlt = String(formData.get("imageAltTemplate") || "").trim();
  const imageAltTemplate =
    (rawImageAlt ? toDbTemplate(rawImageAlt) : "") ||
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
    message: "Your Auto-SEO rules and storefront boosters have been saved.",
  });
};

type TemplateFieldKey =
  | "metaTitleTemplate"
  | "metaDescriptionTemplate"
  | "imageAltTemplate";

type PreviewViewMode = "google" | "ai";
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
    "Engineered for all-mountain precision with a sintered carbon base, responsive flex profile, and effortless edge control.",
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

export default function SettingsStudioRoute() {
  const { audit } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  const [storeDisplayName, setStoreDisplayName] = useState(
    audit.store.storeName,
  );
  const [metaTitleTemplate, setMetaTitleTemplate] = useState(
    toDisplayTemplate(audit.settings.metaTitleTemplate),
  );
  const [metaDescriptionTemplate, setMetaDescriptionTemplate] = useState(
    toDisplayTemplate(audit.settings.metaDescriptionTemplate),
  );
  const [imageAltTemplate, setImageAltTemplate] = useState(
    toDisplayTemplate(audit.settings.imageAltTemplate),
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

  const selectedProduct = useMemo(
    () =>
      catalogProducts.find((p) => p.id === selectedProductId) ??
      catalogProducts[0],
    [catalogProducts, selectedProductId],
  );

  const liveStoreContext = useMemo(() => {
    const cleanName = sanitizeStoreName(
      storeDisplayName.trim() || audit.store.storeName,
    );
    return {
      ...audit.store,
      storeName: cleanName,
      host: formatStoreDomain(audit.store.host, cleanName),
    };
  }, [audit.store, storeDisplayName]);

  const liveMeta = useMemo(
    () =>
      generateMeta(selectedProduct, liveStoreContext, {
        metaTitleTemplate: toDbTemplate(metaTitleTemplate),
        metaDescriptionTemplate: toDbTemplate(metaDescriptionTemplate),
        imageAltTemplate: toDbTemplate(imageAltTemplate),
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
    const dbAlt = toDbTemplate(imageAltTemplate);
    const alts = generateAltTexts(
      selectedProduct,
      liveStoreContext,
      dbAlt,
    );
    return (
      alts[0]?.alt ||
      generateMeta(selectedProduct, liveStoreContext, {
        metaTitleTemplate: dbAlt,
        metaDescriptionTemplate: toDbTemplate(metaDescriptionTemplate),
        imageAltTemplate: dbAlt,
      }).title
    );
  }, [
    selectedProduct,
    liveStoreContext,
    imageAltTemplate,
    metaDescriptionTemplate,
  ]);

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

  const resolvedUrl = productUrl(selectedProduct, liveStoreContext);
  const priceFormatted = formatPrice(
    selectedProduct.minPrice,
    liveStoreContext.currencyCode,
  );
  const isAvailable = selectedProduct.variants.some((v) => v.availableForSale);

  return (
    <div className="pico-shell">
      <TitleBar title="Auto-SEO Rules" />

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
          <span className="pico-pill pico-pill--success">Saved</span>
        </div>
      )}

      <div className="pico-split-layout">
        {/* LEFT COLUMN: Automatic Google & Photo Text Rules + 1-Click Storefront Boosters */}
        <Form
          method="post"
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          <input type="hidden" name="intent" value="save_settings" />

          {/* Card 1: Automatic Google & Photo Text Rules */}
          <section className="pico-bento-card">
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
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
                  Automatic Google &amp; Photo Text Rules
                </h2>
                <p
                  style={{
                    margin: "3px 0 0",
                    fontSize: 12.5,
                    color: "#64748b",
                  }}
                >
                  Set the pattern PicoSEO uses to write your product titles,
                  search descriptions, and photo descriptions.
                </p>
              </div>
              <span className="pico-pill pico-pill--blue">
                Editing:{" "}
                {activeField === "metaTitleTemplate"
                  ? "Google Search Title"
                  : activeField === "metaDescriptionTemplate"
                    ? "Google Search Description"
                    : "Product Photo Description"}
              </span>
            </div>

            {/* Single Clean Row of Clickable Tag Pills */}
            <div
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                marginBottom: 18,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#334155",
                  marginBottom: 8,
                }}
              >
                Click any tag to insert into your text:
              </div>
              <div className="pico-chip-row" style={{ marginTop: 0 }}>
                {TOKEN_PAIRS.map((chip) => (
                  <button
                    key={chip.display}
                    type="button"
                    onClick={() => insertTokenIntoField(chip.display)}
                    className="pico-token-chip"
                  >
                    <PlusChipIcon size={12} />
                    <span>{chip.display}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Your Store or Brand Name */}
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="storeDisplayName"
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#0f172a",
                  marginBottom: 6,
                }}
              >
                Your Store or Brand Name
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

            {/* Google Search Title */}
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
                <span>Google Search Title</span>
                <span
                  className="pico-tabular"
                  style={{ fontSize: 11.5, color: "#047857", fontWeight: 600 }}
                >
                  Length: {liveMeta.title.length} / {META_TITLE_MAX} characters
                  (Ideal)
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
            </div>

            {/* Google Search Description */}
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
                <span>Google Search Description</span>
                <span
                  className="pico-tabular"
                  style={{ fontSize: 11.5, color: "#047857", fontWeight: 600 }}
                >
                  Length: {liveMeta.description.length} / {META_DESCRIPTION_MAX}{" "}
                  characters (Ideal)
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
            </div>

            {/* Product Photo Description (Google Images) */}
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
                <span>Product Photo Description (Google Images)</span>
                <span
                  className="pico-tabular"
                  style={{ fontSize: 11.5, color: "#047857", fontWeight: 600 }}
                >
                  Length: {liveAltPreview.length} / 125 characters (Ideal)
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
            </div>
          </section>

          {/* Card 2: 1-Click Storefront Boosters */}
          <section className="pico-bento-card">
            <h2
              style={{
                margin: "0 0 4px",
                fontSize: 16,
                fontWeight: 600,
                color: "#0f172a",
              }}
            >
              1-Click Storefront Boosters
            </h2>
            <p
              style={{
                margin: "0 0 14px",
                fontSize: 12.5,
                color: "#64748b",
              }}
            >
              Everything runs automatically in the background without slowing
              down your store.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                {
                  name: "enableJsonLdSchema",
                  checked: enableJsonLdSchema,
                  onChange: setEnableJsonLdSchema,
                  title: "Google Rich Results (Price, Stock & Star Badges)",
                  desc: "Shows your product price and In-Stock status directly inside Google search results.",
                  icon: <GlobeSearchIcon size={18} />,
                },
                {
                  name: "enableLcpImagePreload",
                  checked: enableLcpImagePreload,
                  onChange: setEnableLcpImagePreload,
                  title: "Instant Product Photo Speed Boost",
                  desc: "Preloads your main product photo so pages open faster on mobile and desktop.",
                  icon: <GaugeSpeedIcon size={18} />,
                },
                {
                  name: "enableLlmsTxtFeed",
                  checked: enableLlmsTxtFeed,
                  onChange: setEnableLlmsTxtFeed,
                  title: "ChatGPT & Perplexity Shopping Visibility",
                  desc: "Helps AI shopping assistants find, understand, and recommend your products to buyers.",
                  icon: <BotCitationIcon size={18} />,
                },
                {
                  name: "enableIndexNowPing",
                  checked: enableIndexNowPing,
                  onChange: setEnableIndexNowPing,
                  title: "Instant Search Engine Ping",
                  desc: "Notifies search engines immediately whenever you update a price or product.",
                  icon: <RadarIcon size={18} />,
                },
                {
                  name: "autoSyncOnProductUpdate",
                  checked: autoSyncOnProductUpdate,
                  onChange: setAutoSyncOnProductUpdate,
                  title: "Auto-Optimize New Products",
                  desc: "Automatically writes missing Google titles and photo descriptions whenever you add a new product.",
                  icon: <CheckCircleIcon size={18} />,
                },
              ].map((toggle) => (
                <div
                  key={toggle.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 14,
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    background: toggle.checked ? "#f8fafc" : "#ffffff",
                    transition:
                      "background-color 200ms ease, border-color 200ms ease",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      minWidth: 0,
                    }}
                  >
                    <span className="pico-icon-badge">{toggle.icon}</span>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13.5,
                          fontWeight: 600,
                          color: "#0f172a",
                        }}
                      >
                        {toggle.title}
                      </div>
                      <div
                        style={{
                          fontSize: 12.5,
                          color: "#64748b",
                          marginTop: 2,
                        }}
                      >
                        {toggle.desc}
                      </div>
                    </div>
                  </div>
                  <WatermelonToggle
                    name={toggle.name}
                    checked={toggle.checked}
                    onChange={toggle.onChange}
                    ariaLabel={toggle.title}
                  />
                </div>
              ))}
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
                  setMetaTitleTemplate(
                    toDisplayTemplate(DEFAULT_TEMPLATES.metaTitleTemplate),
                  );
                  setMetaDescriptionTemplate(
                    toDisplayTemplate(
                      DEFAULT_TEMPLATES.metaDescriptionTemplate,
                    ),
                  );
                  setImageAltTemplate(
                    toDisplayTemplate(DEFAULT_TEMPLATES.imageAltTemplate),
                  );
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
                <CheckIcon size={15} />
                <span>{isSaving ? "Saving…" : "Save Rules & Boosters"}</span>
              </button>
            </div>
          </section>
        </Form>

        {/* RIGHT COLUMN: Sticky Live Search & AI Preview */}
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
                  Live Search &amp; AI Preview
                </h2>
                <p
                  style={{
                    margin: "2px 0 0",
                    fontSize: 12,
                    color: "#64748b",
                  }}
                >
                  See how your product appears to shoppers on Google and inside
                  AI shopping assistants.
                </p>
              </div>

              {/* Desktop / Mobile Bezel Switcher */}
              <SpringSegmentedControl<BezelMode>
                ariaLabel="Device view"
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

            {/* Product Selector Dropdown */}
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
                Preview with product:
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

            {/* Two Visual Preview Mode Tabs */}
            <div style={{ marginBottom: 14, overflowX: "auto" }}>
              <SpringSegmentedControl<PreviewViewMode>
                ariaLabel="Preview mode"
                value={previewMode}
                onChange={setPreviewMode}
                options={[
                  {
                    value: "google",
                    label: "Google Search Result",
                    icon: <GlobeSearchIcon size={14} />,
                  },
                  {
                    value: "ai",
                    label: "ChatGPT / AI Recommendation",
                    icon: <BotCitationIcon size={14} />,
                  },
                ]}
              />
            </div>

            {/* Device Bezel Stage */}
            <div
              className={`pico-bezel-frame ${
                bezelMode === "mobile"
                  ? "pico-bezel-frame--mobile"
                  : "pico-bezel-frame--desktop"
              }`}
            >
              {/* Browser Top Chrome */}
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
                    : "chatgpt.com • Shopping Assistant"}
                </span>
                <span className="pico-tabular" style={{ fontWeight: 600 }}>
                  {bezelMode === "mobile" ? "Mobile" : "Desktop"}
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
                      <strong>Google Images Photo Description:</strong> “
                      {liveAltPreview}”
                    </div>
                  </div>
                )}

                {previewMode === "ai" && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 14,
                    }}
                  >
                    {/* Shopper Question Bubble */}
                    <div
                      style={{
                        alignSelf: "flex-end",
                        maxWidth: "85%",
                        padding: "10px 14px",
                        borderRadius: "14px 14px 4px 14px",
                        background: "#2563eb",
                        color: "#ffffff",
                        fontSize: 12.5,
                        lineHeight: 1.45,
                      }}
                    >
                      Where can I buy{" "}
                      <strong>{selectedProduct.title}</strong> with fast
                      shipping?
                    </div>

                    {/* AI Assistant Response Card */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                      }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 999,
                          background: "#10b981",
                          color: "#ffffff",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          marginTop: 2,
                        }}
                      >
                        <BotCitationIcon size={15} />
                      </div>

                      <div
                        style={{
                          flex: 1,
                          minWidth: 0,
                          padding: "12px 14px",
                          borderRadius: "4px 14px 14px 14px",
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11.5,
                            fontWeight: 700,
                            color: "#047857",
                            marginBottom: 4,
                          }}
                        >
                          AI Shopping Assistant
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            lineHeight: 1.55,
                            color: "#0f172a",
                            marginBottom: 12,
                          }}
                        >
                          I recommend{" "}
                          <strong>{selectedProduct.title}</strong> from{" "}
                          <strong>{liveStoreContext.storeName}</strong>.{" "}
                          {liveMeta.description}
                        </div>

                        {/* Visual Product Card inside Chat */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                            padding: "12px",
                            borderRadius: 12,
                            border: "1px solid #cbd5e1",
                            background: "#ffffff",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                              minWidth: 0,
                            }}
                          >
                            <ProductThumbnail
                              src={selectedProduct.thumbnailUrl}
                              alt={liveAltPreview}
                              large
                            />
                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: 13.5,
                                  fontWeight: 600,
                                  color: "#0f172a",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {selectedProduct.title}
                              </div>
                              <div
                                style={{
                                  fontSize: 12,
                                  color: "#475569",
                                  marginTop: 2,
                                }}
                              >
                                Official Store • {liveStoreContext.storeName}
                              </div>
                              <div
                                className="pico-tabular"
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  marginTop: 6,
                                }}
                              >
                                <span className="pico-pill pico-pill--success">
                                  {priceFormatted}
                                </span>
                                <span
                                  style={{
                                    fontSize: 11.5,
                                    fontWeight: 600,
                                    color: isAvailable ? "#047857" : "#b45309",
                                  }}
                                >
                                  {isAvailable ? "✓ In Stock" : "Out of Stock"}
                                </span>
                              </div>
                            </div>
                          </div>

                          <a
                            href={resolvedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="pico-btn pico-btn--secondary"
                            style={{
                              padding: "6px 10px",
                              fontSize: 11.5,
                              flexShrink: 0,
                            }}
                          >
                            <span>View Store</span>
                            <ExternalArrowIcon size={12} />
                          </a>
                        </div>
                      </div>
                    </div>
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
