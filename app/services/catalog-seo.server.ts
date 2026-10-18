import type { PicoSeoSettings, ProductOptimizationLog } from "@prisma/client";
import prisma from "../db.server";
import { cdnImage } from "../lib/image";
import { computeSeoScore, needsOptimization } from "../lib/seo-score";
import {
  extractTemplates,
  generateAltTexts,
  generateMeta,
  isDescriptiveAlt,
  productUrl,
} from "../lib/seo-template";
import type {
  AuditedProduct,
  PicoImage,
  PicoProduct,
  PicoVariant,
  ProductStatus,
  SeoTemplates,
  StoreContext,
} from "../lib/types";
import { type AdminClient, formatUserErrors, gql, type UserError } from "./graphql.server";
import { pingIndexNow } from "./indexnow.server";
import { defaultSettings, fetchShopInfo, getOrCreateSettings, toStoreContext } from "./settings.server";

interface RawImageNode {
  url: string;
  altText?: string | null;
  width?: number | null;
  height?: number | null;
}

interface RawMediaNode {
  id?: string;
  alt?: string | null;
  mediaContentType?: string;
  image?: RawImageNode | null;
}

interface RawVariantNode {
  id: string;
  title: string;
  price: string;
  sku?: string | null;
  barcode?: string | null;
  availableForSale?: boolean;
  image?: RawImageNode | null;
}

interface RawProductNode {
  id: string;
  title: string;
  handle: string;
  status: ProductStatus;
  vendor: string;
  productType: string;
  tags: string[];
  description: string;
  onlineStoreUrl?: string | null;
  totalInventory?: number | null;
  seo?: {
    title?: string | null;
    description?: string | null;
  } | null;
  featuredImage?: RawImageNode | null;
  media?: {
    nodes: RawMediaNode[];
  } | null;
  variants?: {
    nodes: RawVariantNode[];
  } | null;
  priceRangeV2?: {
    minVariantPrice: { amount: string; currencyCode: string };
    maxVariantPrice: { amount: string; currencyCode: string };
  } | null;
}

interface CatalogQueryData {
  products: {
    nodes: RawProductNode[];
  };
}

/**
 * Queries the store's products WITHOUT restrictive status filters so draft,
 * active, and unindexed items are all visible in the SEO auditor.
 * Fetches featuredImage, MediaImage nodes, and variant images with width=300
 * CDN transforms alongside full-resolution URLs.
 */
const CATALOG_PRODUCTS_QUERY = `#graphql
  query PicoCatalogProducts($first: Int!) {
    products(first: $first, sortKey: UPDATED_AT, reverse: true) {
      nodes {
        id
        title
        handle
        status
        vendor
        productType
        tags
        description
        onlineStoreUrl
        totalInventory
        seo {
          title
          description
        }
        featuredImage {
          url(transform: { maxWidth: 300 })
          altText
          width
          height
        }
        media(first: 20) {
          nodes {
            id
            alt
            mediaContentType
            ... on MediaImage {
              id
              alt
              image {
                url(transform: { maxWidth: 300 })
                altText
                width
                height
              }
            }
          }
        }
        variants(first: 25) {
          nodes {
            id
            title
            price
            sku
            barcode
            availableForSale
            image {
              url(transform: { maxWidth: 300 })
              altText
              width
              height
            }
          }
        }
        priceRangeV2 {
          minVariantPrice {
            amount
            currencyCode
          }
          maxVariantPrice {
            amount
            currencyCode
          }
        }
      }
    }
  }
`;

const SINGLE_PRODUCT_QUERY = `#graphql
  query PicoSingleProduct($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      status
      vendor
      productType
      tags
      description
      onlineStoreUrl
      totalInventory
      seo {
        title
        description
      }
      featuredImage {
        url(transform: { maxWidth: 300 })
        altText
        width
        height
      }
      media(first: 20) {
        nodes {
          id
          alt
          mediaContentType
          ... on MediaImage {
            id
            alt
            image {
              url(transform: { maxWidth: 300 })
              altText
              width
              height
            }
          }
        }
      }
      variants(first: 25) {
        nodes {
          id
          title
          price
          sku
          barcode
          availableForSale
          image {
            url(transform: { maxWidth: 300 })
            altText
            width
            height
          }
        }
      }
      priceRangeV2 {
        minVariantPrice {
          amount
          currencyCode
        }
        maxVariantPrice {
          amount
          currencyCode
        }
      }
    }
  }
`;

const PRODUCT_SEO_MUTATION = `#graphql
  mutation PicoUpdateProductSeo($input: ProductInput!) {
    productUpdate(input: $input) {
      product {
        id
        seo {
          title
          description
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const FILE_ALT_MUTATION = `#graphql
  mutation PicoUpdateFilesAlt($files: [FileUpdateInput!]!) {
    fileUpdate(files: $files) {
      files {
        id
        alt
      }
      userErrors {
        field
        message
      }
    }
  }
`;

function normalizeProduct(node: RawProductNode): PicoProduct {
  const images: PicoImage[] = [];
  const seenUrls = new Set<string>();

  for (const mediaNode of node.media?.nodes ?? []) {
    const img = mediaNode.image;
    if (!img?.url) continue;
    const sized = cdnImage(img.url, 300) ?? img.url;
    seenUrls.add(sized.split("?")[0]);
    images.push({
      id: mediaNode.id ?? null,
      url: sized,
      alt: mediaNode.alt ?? img.altText ?? null,
      width: img.width ?? null,
      height: img.height ?? null,
    });
  }

  if (node.featuredImage?.url) {
    const sized = cdnImage(node.featuredImage.url, 300) ?? node.featuredImage.url;
    const base = sized.split("?")[0];
    if (!seenUrls.has(base)) {
      seenUrls.add(base);
      images.unshift({
        id: null,
        url: sized,
        alt: node.featuredImage.altText ?? null,
        width: node.featuredImage.width ?? null,
        height: node.featuredImage.height ?? null,
      });
    }
  }

  const variants: PicoVariant[] = (node.variants?.nodes ?? []).map((v) => {
    const variantImgUrl = v.image?.url ? cdnImage(v.image.url, 300) : null;
    if (variantImgUrl) {
      const base = variantImgUrl.split("?")[0];
      if (!seenUrls.has(base)) {
        seenUrls.add(base);
        images.push({
          id: null,
          url: variantImgUrl,
          alt: v.image?.altText ?? null,
          width: v.image?.width ?? null,
          height: v.image?.height ?? null,
        });
      }
    }
    return {
      id: v.id,
      title: v.title,
      price: v.price,
      sku: v.sku ?? null,
      barcode: v.barcode ?? null,
      availableForSale: Boolean(v.availableForSale),
      imageUrl: variantImgUrl,
    };
  });

  const primaryUrl =
    (node.featuredImage?.url ? cdnImage(node.featuredImage.url, 300) : null) ??
    images[0]?.url ??
    variants.find((v) => v.imageUrl)?.imageUrl ??
    null;

  const minPrice =
    node.priceRangeV2?.minVariantPrice?.amount ??
    variants[0]?.price ??
    "0.00";
  const maxPrice =
    node.priceRangeV2?.maxVariantPrice?.amount ??
    variants[variants.length - 1]?.price ??
    minPrice;

  return {
    id: node.id,
    title: node.title,
    handle: node.handle,
    status: node.status,
    vendor: node.vendor || "",
    productType: node.productType || "",
    tags: node.tags ?? [],
    description: node.description || "",
    onlineStoreUrl: node.onlineStoreUrl ?? null,
    totalInventory: node.totalInventory ?? null,
    seoTitle: node.seo?.title ?? null,
    seoDescription: node.seo?.description ?? null,
    images,
    variants,
    primaryImageUrl: primaryUrl,
    thumbnailUrl: primaryUrl ? cdnImage(primaryUrl, 300) : null,
    minPrice,
    maxPrice,
  };
}

export { extractTemplates };

export interface CatalogAuditSummary {
  store: StoreContext;
  settings: PicoSeoSettings;
  products: AuditedProduct[];
  /** Null when the scan returned no products or the catalog query failed. */
  overallScore: number | null;
  productsNeedingFix: number;
  missingAltTotal: number;
  optimizedProductsCount: number;
  recentLogs: ProductOptimizationLog[];
  /** Products requested from Shopify for this screen. Not the full catalog. */
  scannedLimit: number;
  catalogError: string | null;
  settingsUnavailable: boolean;
}

export async function fetchCatalogAudit(
  admin: AdminClient,
  shop: string,
  first = 50,
): Promise<CatalogAuditSummary> {
  let settings: PicoSeoSettings;
  let settingsUnavailable = false;
  try {
    settings = await getOrCreateSettings(shop, admin);
  } catch (err) {
    if (err instanceof Response) throw err;
    console.warn("[PicoSEO] getOrCreateSettings fallback:", err);
    settings = defaultSettings(shop);
    settingsUnavailable = true;
  }

  let shopInfo: Awaited<ReturnType<typeof fetchShopInfo>> = {
    name: shop.replace(/\.myshopify\.com$/i, ""),
    myshopifyDomain: shop,
    currencyCode: "USD",
    primaryDomain: null,
  };
  try {
    const fetched = await fetchShopInfo(admin);
    if (fetched) shopInfo = fetched;
  } catch (err) {
    if (err instanceof Response) throw err;
    console.warn("[PicoSEO] fetchShopInfo fallback:", err);
  }

  // A failed audit is not an empty catalog with a perfect score.
  const catalogData = await gql<CatalogQueryData>(admin, CATALOG_PRODUCTS_QUERY, { first });
  const rawNodes = catalogData.products.nodes;
  const catalogError: string | null = null;

  let recentLogs: ProductOptimizationLog[] = [];
  try {
    recentLogs = await prisma.productOptimizationLog.findMany({
      where: { shop },
      orderBy: { updatedAt: "desc" },
      take: 12,
    });
  } catch (err) {
    console.warn("[PicoSEO] optimization logs query fallback:", err);
    recentLogs = [];
  }

  const store = toStoreContext(shopInfo, settings);
  const products: AuditedProduct[] = rawNodes.map((node) => {
    const product = normalizeProduct(node);
    const audit = computeSeoScore(product);
    return { ...product, audit };
  });

  const overallScore =
    products.length > 0
      ? Math.round(products.reduce((sum, p) => sum + p.audit.score, 0) / products.length)
      : null;

  const productsNeedingFix = products.filter((p) => needsOptimization(p)).length;
  const missingAltTotal = products.reduce((sum, p) => sum + p.audit.missingAltCount, 0);
  const optimizedProductsCount = products.filter((p) => p.audit.score >= 80).length;

  return {
    store,
    settings,
    products,
    overallScore,
    productsNeedingFix,
    missingAltTotal,
    optimizedProductsCount,
    recentLogs,
    scannedLimit: first,
    catalogError,
    settingsUnavailable,
  };
}

export async function fetchSingleAuditedProduct(
  admin: AdminClient,
  productId: string,
): Promise<AuditedProduct | null> {
  const data = await gql<{ product: RawProductNode | null }>(admin, SINGLE_PRODUCT_QUERY, {
    id: productId,
  });
  if (!data.product) return null;
  const product = normalizeProduct(data.product);
  return { ...product, audit: computeSeoScore(product) };
}

export interface OptimizeProductResult {
  productId: string;
  productTitle: string;
  productImageUrl: string | null;
  seoScoreBefore: number;
  seoScoreAfter: number;
  metaUpdated: boolean;
  altTextsUpdatedCount: number;
  indexNowPinged: boolean;
  resolvedTitle: string;
  resolvedDescription: string;
}

/**
 * Optimizes a single product in 1 click:
 * - Populates missing (or suboptimal) SEO title and meta description using the
 *   merchant's token templates
 * - Populates descriptive alt text on all MediaImage nodes missing alt text
 * - Pings IndexNow if enabled
 * - Records the before/after score in ProductOptimizationLog and increments
 *   PicoSeoSettings counters
 */
export async function optimizeSingleProduct(
  admin: AdminClient,
  shop: string,
  productId: string,
  options?: { forceOverwrite?: boolean },
): Promise<OptimizeProductResult> {
  const [settings, shopInfo, existing] = await Promise.all([
    getOrCreateSettings(shop, admin),
    fetchShopInfo(admin),
    fetchSingleAuditedProduct(admin, productId),
  ]);

  if (!existing) {
    throw new Error(`Product not found: ${productId}`);
  }

  const store = toStoreContext(shopInfo, settings);
  const templates = extractTemplates(settings);
  const seoScoreBefore = existing.audit.score;

  const generatedMeta = generateMeta(existing, store, templates);
  const shouldUpdateTitle =
    Boolean(options?.forceOverwrite) || !existing.seoTitle?.trim();
  const shouldUpdateDescription =
    Boolean(options?.forceOverwrite) || !existing.seoDescription?.trim();

  const nextSeoTitle = shouldUpdateTitle
    ? generatedMeta.title
    : existing.seoTitle!.trim();
  const nextSeoDescription = shouldUpdateDescription
    ? generatedMeta.description
    : existing.seoDescription!.trim();

  let metaUpdated = false;
  if (shouldUpdateTitle || shouldUpdateDescription) {
    const res = await gql<{
      productUpdate: { userErrors: UserError[] };
    }>(admin, PRODUCT_SEO_MUTATION, {
      input: {
        id: existing.id,
        seo: {
          title: nextSeoTitle,
          description: nextSeoDescription,
        },
      },
    });
    if (res.productUpdate.userErrors?.length) {
      throw new Error(formatUserErrors(res.productUpdate.userErrors));
    }
    metaUpdated = true;
  }

  // Alt-text optimization across all MediaImage nodes
  const generatedAlts = generateAltTexts(existing, store, templates.imageAltTemplate);
  const filesToUpdate = generatedAlts
    .filter(
      ({ image }) =>
        Boolean(image.id) &&
        (Boolean(options?.forceOverwrite) || !isDescriptiveAlt(image.alt)),
    )
    .map(({ image, alt }) => ({
      id: image.id as string,
      alt,
    }));

  let altTextsUpdatedCount = 0;
  if (filesToUpdate.length > 0) {
    const fileRes = await gql<{
      fileUpdate: { userErrors: UserError[] };
    }>(admin, FILE_ALT_MUTATION, {
      files: filesToUpdate,
    });
    if (fileRes.fileUpdate.userErrors?.length) {
      throw new Error(formatUserErrors(fileRes.fileUpdate.userErrors));
    }
    altTextsUpdatedCount = filesToUpdate.length;
  }

  // Compute updated score deterministically
  const updatedProduct: PicoProduct = {
    ...existing,
    seoTitle: nextSeoTitle,
    seoDescription: nextSeoDescription,
    images: existing.images.map((img) => {
      const updated = filesToUpdate.find((f) => f.id === img.id);
      return updated ? { ...img, alt: updated.alt } : img;
    }),
  };
  const seoScoreAfter = computeSeoScore(updatedProduct).score;

  // Ping IndexNow if enabled
  let indexNowPinged = false;
  if (settings.enableIndexNowPing && settings.indexNowApiKey) {
    const ping = await pingIndexNow(store.host, settings.indexNowApiKey, [
      productUrl(existing, store),
    ]);
    indexNowPinged = ping.ok;
  }

  await prisma.$transaction([
    prisma.productOptimizationLog.create({
      data: {
        shop,
        productId: existing.id,
        productTitle: existing.title,
        productImageUrl: existing.thumbnailUrl,
        seoScoreBefore,
        seoScoreAfter,
        altTextsUpdatedCount,
        metaUpdated,
        indexNowPinged,
      },
    }),
    prisma.picoSeoSettings.update({
      where: { shop },
      data: {
        totalProductsOptimized: { increment: metaUpdated || altTextsUpdatedCount > 0 ? 1 : 0 },
        totalAltTextsFixed: { increment: altTextsUpdatedCount },
        totalIndexNowPings: { increment: indexNowPinged ? 1 : 0 },
      },
    }),
  ]);

  return {
    productId: existing.id,
    productTitle: existing.title,
    productImageUrl: existing.thumbnailUrl,
    seoScoreBefore,
    seoScoreAfter,
    metaUpdated,
    altTextsUpdatedCount,
    indexNowPinged,
    resolvedTitle: nextSeoTitle,
    resolvedDescription: nextSeoDescription,
  };
}

export interface BulkOptimizeSummary {
  optimizedCount: number;
  failedCount: number;
  altTextsFixed: number;
  indexNowPinged: boolean;
  averageScoreAfter: number;
  results: OptimizeProductResult[];
}

/**
 * 1-Click Bulk Optimizer: audits the catalog, fixes every product missing
 * SEO title, meta description, or descriptive media alt text in the loaded
 * audit, and reports failed products separately from successful updates.
 */
export async function optimizeCatalogBulk(
  admin: AdminClient,
  shop: string,
  options?: { forceOverwriteAll?: boolean },
): Promise<BulkOptimizeSummary> {
  const audit = await fetchCatalogAudit(admin, shop, 50);
  if (audit.catalogError) {
    throw new Error(audit.catalogError);
  }
  const targets = options?.forceOverwriteAll
    ? audit.products
    : audit.products.filter((p) => needsOptimization(p));

  const results: OptimizeProductResult[] = [];
  let failedCount = 0;
  let altTextsFixed = 0;

  for (const product of targets) {
    try {
      const res = await optimizeSingleProduct(admin, shop, product.id, {
        forceOverwrite: Boolean(options?.forceOverwriteAll),
      });
      results.push(res);
      altTextsFixed += res.altTextsUpdatedCount;
    } catch (error) {
      if (error instanceof Response) throw error;
      failedCount += 1;
      console.error(`[PicoSEO] Failed optimizing ${product.id}`, error);
    }
  }

  const averageScoreAfter =
    results.length > 0
      ? Math.round(results.reduce((s, r) => s + r.seoScoreAfter, 0) / results.length)
      : (audit.overallScore ?? 0);

  return {
    optimizedCount: results.length,
    failedCount,
    altTextsFixed,
    indexNowPinged: results.some((r) => r.indexNowPinged),
    averageScoreAfter,
    results,
  };
}
