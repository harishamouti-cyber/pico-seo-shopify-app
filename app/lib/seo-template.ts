import type { PicoImage, PicoProduct, PicoVariant, SeoTemplates, StoreContext } from "./types";
import { imageKey } from "./image";

export const META_TITLE_MAX = 70;
export const META_DESCRIPTION_MIN = 70;
export const META_DESCRIPTION_MAX = 160;

export const DEFAULT_TEMPLATES: SeoTemplates = {
  metaTitleTemplate: "{{product_title}} | {{store_name}}",
  metaDescriptionTemplate: "{{product_title}} from {{store_name}}. {{product_type}}",
  imageAltTemplate: "{{product_title}} - {{variant_title}}",
};

export function extractTemplates(settings: SeoTemplates): SeoTemplates {
  return {
    metaTitleTemplate: settings.metaTitleTemplate,
    metaDescriptionTemplate: settings.metaDescriptionTemplate,
    imageAltTemplate: settings.imageAltTemplate,
  };
}

export const TEMPLATE_TOKENS = [
  { token: "{{product_title}}", label: "Product title" },
  { token: "{{variant_title}}", label: "Variant" },
  { token: "{{price}}", label: "Price" },
  { token: "{{store_name}}", label: "Store name" },
  { token: "{{product_type}}", label: "Product type" },
] as const;

export function formatPrice(amount: string | number, currencyCode: string) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return String(amount);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode || "USD",
      minimumFractionDigits: value % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currencyCode}`;
  }
}

function variantLabel(variant?: PicoVariant | null) {
  if (!variant) return "";
  const t = variant.title?.trim() ?? "";
  return /^default title$/i.test(t) ? "" : t;
}

/**
 * Removes the debris left behind when an optional token resolves to an empty
 * string — e.g. "Board () for $40" or "Board -  by Acme".
 */
function tidy(text: string) {
  return text
    .replace(/\(\s*\)|\[\s*\]/g, "")
    .replace(/\s+([-–|·])\s+(?=(by|at|for|from)\s)/gi, " ")
    .replace(/([-–|·:,])(\s*[-–|·:,])+/g, "$1")
    .replace(/\s+([.,!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-–|·:,]+|[\s\-–|·:,]+$/g, "")
    .trim();
}

export function clampText(text: string, max: number) {
  if (text.length <= max) return text;
  const slice = text.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${cut.replace(/[\s,.;:\-–|]+$/, "")}…`;
}

export function renderTemplate(
  template: string,
  product: Pick<PicoProduct, "title" | "productType" | "vendor" | "minPrice" | "variants">,
  store: StoreContext,
  variant?: PicoVariant | null,
) {
  const v = variant ?? product.variants[0] ?? null;
  const values: Record<string, string> = {
    product_title: product.title,
    variant_title: variantLabel(v),
    price: formatPrice(v?.price ?? product.minPrice, store.currencyCode),
    store_name: store.storeName,
    product_type: product.productType || "",
    vendor: product.vendor || "",
  };
  const raw = template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key: string) => values[key.toLowerCase()] ?? "");
  return tidy(raw);
}

export function generateMeta(product: PicoProduct, store: StoreContext, templates: SeoTemplates) {
  return {
    title: clampText(renderTemplate(templates.metaTitleTemplate, product, store), META_TITLE_MAX),
    description: clampText(
      renderTemplate(templates.metaDescriptionTemplate, product, store),
      META_DESCRIPTION_MAX,
    ),
  };
}

/** Finds the variant whose image matches this media asset (falls back to the first). */
export function variantForImage(product: PicoProduct, image: PicoImage) {
  const key = imageKey(image.url);
  return product.variants.find((v) => v.imageUrl && imageKey(v.imageUrl) === key) ?? product.variants[0] ?? null;
}

export function generateAltTexts(product: PicoProduct, store: StoreContext, template: string) {
  const seen = new Map<string, number>();
  return product.images.map((image) => {
    const base = clampText(renderTemplate(template, product, store, variantForImage(product, image)), 125);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return { image, alt: count > 1 ? `${base} – view ${count}` : base };
  });
}

export function isDescriptiveAlt(alt: string | null | undefined) {
  if (!alt) return false;
  const a = alt.trim();
  if (a.length < 5) return false;
  if (/\.(jpe?g|png|webp|gif|avif|heic)$/i.test(a)) return false;
  if (/^(img|image|dsc|photo|pic|screenshot)[\s_-]?\d*$/i.test(a)) return false;
  return true;
}

export function productUrl(product: Pick<PicoProduct, "handle">, store: StoreContext) {
  return `https://${store.host}/products/${product.handle}`;
}
