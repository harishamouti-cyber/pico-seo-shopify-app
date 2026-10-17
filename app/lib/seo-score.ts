import type { PicoProduct, SeoIssue, SeoScore } from "./types";
import { isDescriptiveAlt, META_DESCRIPTION_MAX, META_DESCRIPTION_MIN, META_TITLE_MAX } from "./seo-template";

/**
 * SEO & AI Readiness Score (0–100)
 *
 *  25  Custom SEO title (full marks at 15–70 chars)
 *  25  Meta description (full marks at 70–160 chars)
 *  30  Descriptive alt text across every media image
 *  20  Rich product metadata (description depth, type, vendor, tags)
 */
export function computeSeoScore(product: PicoProduct): SeoScore {
  const issues: SeoIssue[] = [];

  // Title
  let title = 0;
  const seoTitle = product.seoTitle?.trim() ?? "";
  if (!seoTitle) {
    issues.push({ key: "title", label: "Missing SEO title", tone: "critical" });
  } else if (seoTitle.length < 15 || seoTitle.length > META_TITLE_MAX) {
    title = 15;
    issues.push({ key: "title-length", label: "SEO title length", tone: "warning" });
  } else {
    title = 25;
  }

  // Description
  let description = 0;
  const seoDescription = product.seoDescription?.trim() ?? "";
  if (!seoDescription) {
    issues.push({ key: "description", label: "Missing meta description", tone: "critical" });
  } else if (seoDescription.length < META_DESCRIPTION_MIN || seoDescription.length > META_DESCRIPTION_MAX) {
    description = 14;
    issues.push({ key: "description-length", label: "Meta description length", tone: "warning" });
  } else {
    description = 25;
  }

  // Alt text
  let altText = 0;
  let missingAltCount = 0;
  if (product.images.length === 0) {
    issues.push({ key: "no-images", label: "No product images", tone: "warning" });
  } else {
    const descriptive = product.images.filter((img) => isDescriptiveAlt(img.alt)).length;
    missingAltCount = product.images.length - descriptive;
    altText = Math.round((30 * descriptive) / product.images.length);
    if (missingAltCount > 0) {
      issues.push({
        key: "alt",
        label: `${missingAltCount} missing alt ${missingAltCount === 1 ? "text" : "texts"}`,
        tone: "critical",
      });
    }
  }

  // Rich metadata
  let richData = 0;
  if (product.description.trim().length >= 120) richData += 8;
  else issues.push({ key: "thin", label: "Thin description", tone: "info" });
  if (product.productType.trim()) richData += 4;
  else issues.push({ key: "type", label: "No product type", tone: "info" });
  if (product.vendor.trim()) richData += 4;
  if (product.tags.length > 0) richData += 4;
  else issues.push({ key: "tags", label: "No tags", tone: "info" });

  return {
    score: Math.max(0, Math.min(100, title + description + altText + richData)),
    issues,
    breakdown: { title, description, altText, richData },
    missingAltCount,
  };
}

/** Whether the 1-click optimizer has anything it can fix on this product. */
export function needsOptimization(product: PicoProduct) {
  return (
    !product.seoTitle?.trim() ||
    !product.seoDescription?.trim() ||
    product.images.some((img) => img.id && !isDescriptiveAlt(img.alt))
  );
}

export function scoreTone(score: number): "success" | "warning" | "critical" {
  if (score >= 80) return "success";
  if (score >= 50) return "warning";
  return "critical";
}
