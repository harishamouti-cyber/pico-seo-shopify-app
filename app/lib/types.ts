/**
 * Shared catalog types. Safe to import from both server and client modules.
 */

export type ProductStatus = "ACTIVE" | "DRAFT" | "ARCHIVED" | "UNLISTED";

export interface PicoImage {
  /** MediaImage GID — present for product media that can be updated. */
  id: string | null;
  url: string;
  alt: string | null;
  width: number | null;
  height: number | null;
}

export interface PicoVariant {
  id: string;
  title: string;
  price: string;
  sku: string | null;
  barcode: string | null;
  availableForSale: boolean;
  imageUrl: string | null;
}

export interface PicoProduct {
  id: string;
  title: string;
  handle: string;
  status: ProductStatus;
  vendor: string;
  productType: string;
  tags: string[];
  description: string;
  onlineStoreUrl: string | null;
  totalInventory: number | null;
  seoTitle: string | null;
  seoDescription: string | null;
  images: PicoImage[];
  variants: PicoVariant[];
  /** Original-resolution primary image (featured → media → variant). */
  primaryImageUrl: string | null;
  /** `width=300` CDN thumbnail of the primary image. */
  thumbnailUrl: string | null;
  minPrice: string;
  maxPrice: string;
}

export interface StoreContext {
  storeName: string;
  shopDomain: string;
  /** Primary storefront host, e.g. `example.com` or `shop.myshopify.com`. */
  host: string;
  currencyCode: string;
}

export interface SeoTemplates {
  metaTitleTemplate: string;
  metaDescriptionTemplate: string;
  imageAltTemplate: string;
}

export type IssueTone = "critical" | "warning" | "info";

export interface SeoIssue {
  key: string;
  label: string;
  tone: IssueTone;
}

export interface SeoScore {
  score: number;
  issues: SeoIssue[];
  breakdown: {
    title: number;
    description: number;
    altText: number;
    richData: number;
  };
  missingAltCount: number;
}

export interface AuditedProduct extends PicoProduct {
  audit: SeoScore;
}
