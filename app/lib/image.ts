/**
 * Shopify CDN helpers. Shopify's image CDN honours a `width` query parameter
 * and returns a proportionally scaled asset — no cropping — which pairs with
 * `object-fit: contain` in the UI so product photography is never clipped.
 */
export function cdnImage(url: string | null | undefined, width = 300) {
  if (!url) return null;
  try {
    const parsed = new URL(url.startsWith("//") ? `https:${url}` : url);
    parsed.searchParams.set("width", String(width));
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Strips query strings so the same asset can be matched across variants. */
export function imageKey(url: string | null | undefined) {
  if (!url) return "";
  return url.split("?")[0].replace(/^https?:/, "");
}

/** `gid://shopify/ProductVariant/123` → `123` */
export function legacyId(gid: string) {
  const parts = gid.split("/");
  return parts[parts.length - 1] ?? gid;
}
