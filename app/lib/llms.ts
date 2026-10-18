import type { PicoProduct, StoreContext } from "./types";
import { formatPrice, productUrl } from "./seo-template";

export interface LlmsProduct {
  title: string;
  handle: string;
  url: string;
  productType: string;
  vendor: string;
  minPrice: string;
  maxPrice: string;
  available: boolean;
  summary: string;
}

export function toLlmsProduct(product: PicoProduct, store: StoreContext): LlmsProduct {
  const summary = (product.seoDescription || product.description || "").replace(/\s+/g, " ").trim();
  return {
    title: product.title,
    handle: product.handle,
    url: product.onlineStoreUrl || productUrl(product, store),
    productType: product.productType,
    vendor: product.vendor,
    minPrice: product.minPrice,
    maxPrice: product.maxPrice,
    available: product.variants.some((v) => v.availableForSale),
    summary: summary.length > 220 ? `${summary.slice(0, 217).trimEnd()}…` : summary,
  };
}

export function llmsProductEntry(p: LlmsProduct, currencyCode: string) {
  const min = formatPrice(p.minPrice, currencyCode);
  const max = formatPrice(p.maxPrice, currencyCode);
  const lines = [
    `### [${p.title}](${p.url})`,
    `- Price: ${min === max ? min : `${min} – ${max}`}`,
    `- Availability: ${p.available ? "In stock" : "Out of stock"}`,
  ];
  if (p.productType) lines.push(`- Category: ${p.productType}`);
  if (p.vendor) lines.push(`- Brand: ${p.vendor}`);
  lines.push(`- Buy: ${p.url}`);
  if (p.summary) lines.push(`- Summary: ${p.summary}`);
  return lines.join("\n");
}

/**
 * Builds a Markdown product list in the llms.txt shape (https://llmstxt.org).
 * Prices and availability come from the Shopify snapshot used to build the file.
 * Publishing the file does not mean an assistant will cite the products.
 */
export function buildLlmsDocument(
  store: StoreContext,
  products: LlmsProduct[],
  generatedAt = new Date(),
  _options?: { sampleLimit?: number },
) {
  const inStock = products.filter((p) => p.available).length;
  const categories = Array.from(new Set(products.map((p) => p.productType).filter(Boolean))).slice(0, 12);

  const header = [
    `# ${store.storeName}`,
    "",
    `> Official product catalog for ${store.storeName} (https://${store.host}). Structured for AI shopping assistants with live pricing in ${store.currencyCode}, availability, and direct purchase links.`,
    "",
    "## Brand profile",
    `- Store: ${store.storeName}`,
    `- Website: https://${store.host}`,
    `- Currency: ${store.currencyCode}`,
    `- Active products: ${products.length} (${inStock} in stock)`,
    ...(categories.length ? [`- Categories: ${categories.join(", ")}`] : []),
    `- Last updated: ${generatedAt.toISOString()}`,
    "",
    "## Key pages",
    `- [Home](https://${store.host}/)`,
    `- [All products](https://${store.host}/collections/all)`,
    `- [Search](https://${store.host}/search)`,
    "",
    "## Products",
    "",
  ];

  return `${header.join("\n")}${products.map((p) => llmsProductEntry(p, store.currencyCode)).join("\n\n")}\n`;
}
