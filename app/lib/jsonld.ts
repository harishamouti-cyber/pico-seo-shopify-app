import type { PicoProduct, StoreContext } from "./types";
import { formatPrice, productUrl } from "./seo-template";
import { legacyId } from "./image";

/**
 * TypeScript mirror of the Liquid output in
 * `extensions/picoseo-schema/blocks/picoseo-head.liquid`. Used by the
 * simulator so merchants can inspect the exact payload before it ships.
 */
export function buildProductJsonLd(product: PicoProduct, store: StoreContext, options = { faq: true }) {
  const url = productUrl(product, store);
  const firstVariant = product.variants.find((v) => v.availableForSale) ?? product.variants[0];
  const brandName = product.vendor || store.storeName;
  const plainDescription = product.description.replace(/\s+/g, " ").trim();
  const inStock = product.variants.some((v) => v.availableForSale);

  const productNode: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#product`,
    name: product.title,
    url,
    description: plainDescription.slice(0, 5000) || product.title,
    image: product.images.slice(0, 8).map((img) => img.url.split("?")[0]),
    brand: { "@type": "Brand", name: brandName },
    ...(firstVariant?.sku ? { sku: firstVariant.sku } : {}),
    ...(product.productType ? { category: product.productType } : {}),
    offers: product.variants.slice(0, 50).map((v) => ({
      "@type": "Offer",
      url: `${url}?variant=${legacyId(v.id)}`,
      ...(v.sku ? { sku: v.sku } : {}),
      name: v.title,
      price: Number(v.price),
      priceCurrency: store.currencyCode,
      availability: `https://schema.org/${v.availableForSale ? "InStock" : "OutOfStock"}`,
      seller: { "@type": "Organization", name: store.storeName },
    })),
  };

  const nodes: Record<string, unknown>[] = [productNode];

  if (options.faq) {
    const price = formatPrice(product.minPrice, store.currencyCode);
    const shortDescription = plainDescription.split(" ").slice(0, 60).join(" ") || product.title;
    nodes.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        qa(`What is ${product.title}?`, shortDescription),
        qa(
          `How much does ${product.title} cost?`,
          `${product.title} is listed at ${store.storeName} from ${price}.`,
        ),
        qa(
          `Is ${product.title} in stock?`,
          inStock
            ? `Shopify currently shows ${product.title} as available at ${store.storeName}.`
            : `Shopify currently shows ${product.title} as unavailable at ${store.storeName}.`,
        ),
        ...(product.vendor
          ? [qa(`Which vendor is listed for ${product.title}?`, `Shopify lists ${product.vendor} as the vendor.`)]
          : []),
      ],
    });
  }

  return nodes;
}

function qa(name: string, text: string) {
  return { "@type": "Question", name, acceptedAnswer: { "@type": "Answer", text } };
}

export interface SchemaCheck {
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

/** Validates the fields Google requires for Product rich results. */
export function validateProductJsonLd(product: PicoProduct): SchemaCheck[] {
  const checks: SchemaCheck[] = [];
  checks.push({
    label: "Product name",
    status: product.title ? "pass" : "fail",
    detail: product.title ? "Present" : "Missing product title",
  });
  checks.push({
    label: "Product image",
    status: product.images.length ? "pass" : "fail",
    detail: product.images.length ? `${product.images.length} image(s) in payload` : "Google requires at least one image",
  });
  checks.push({
    label: "Offer price & currency",
    status: product.variants.length ? "pass" : "fail",
    detail: product.variants.length ? `${product.variants.length} offer(s)` : "No variants found",
  });
  checks.push({
    label: "Availability",
    status: "pass",
    detail: product.variants.some((v) => v.availableForSale) ? "InStock" : "OutOfStock",
  });
  checks.push({
    label: "Brand",
    status: product.vendor ? "pass" : "warn",
    detail: product.vendor ? product.vendor : "Falls back to store name",
  });
  checks.push({
    label: "Description",
    status: product.description.trim().length >= 50 ? "pass" : "warn",
    detail: product.description.trim().length >= 50 ? "Rich description" : "Short description weakens AI answers",
  });
  return checks;
}
