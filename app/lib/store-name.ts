/**
 * Converts raw development handles into a clean, merchant-facing store name.
 *
 *   "quickstart-9f3a1c2e.myshopify.com" → "Quickstart"
 *   "pico_seo-dev-store-2"              → "Pico Seo"
 *   "Acme Outdoor Co."                  → "Acme Outdoor Co."
 */
const NOISE_TOKENS = new Set([
  "dev",
  "development",
  "test",
  "testing",
  "staging",
  "stage",
  "sandbox",
  "demo",
  "preview",
  "tmp",
  "myshopify",
  "com",
  "store",
  "shop",
]);

const SMALL_WORDS = new Set(["and", "of", "the", "for", "a", "an", "in", "on", "by", "to"]);

function isNoise(token: string) {
  const t = token.toLowerCase();
  if (NOISE_TOKENS.has(t)) return true;
  if (/^\d+$/.test(t)) return true; // pure numbers
  if (/^[0-9a-f]{6,}$/.test(t) && /\d/.test(t)) return true; // hex hashes
  if (/^[a-z]*\d+[a-z\d]*$/.test(t) && t.length >= 8) return true; // random ids
  return false;
}

const BRAND_OVERRIDES: Record<string, string> = {
  rankpilot: "RankPilot",
  picoseo: "PicoSEO",
  quickstart: "QuickStart",
};

function titleCase(words: string[]) {
  return words
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (BRAND_OVERRIDES[lower]) return BRAND_OVERRIDES[lower];
      if (i > 0 && SMALL_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

export function sanitizeStoreName(raw: string | null | undefined): string {
  if (!raw) return "Your Store";
  const trimmed = raw.trim().replace(/\.myshopify\.com$/i, "");

  // Already human-formatted (spaces + capitals, no handle separators).
  if (/\s/.test(trimmed) && /[A-Z]/.test(trimmed) && !/[-_]/.test(trimmed)) {
    return trimmed;
  }

  const tokens = trimmed.split(/[\s\-_.]+/).filter(Boolean);
  const meaningful = tokens.filter((t) => !isNoise(t));
  const chosen = meaningful.length ? meaningful : tokens.filter((t) => !/^\d+$/.test(t));
  if (!chosen.length) return "Your Store";
  return titleCase(chosen);
}

/**
 * Formats a store host so raw `.myshopify.com` development handles
 * (such as `rankpilot-xk8wrvgu.myshopify.com`) never leak into badges or
 * Google Search previews, returning a clean domain like `rankpilot.com`.
 */
export function formatStoreDomain(
  rawHost: string | null | undefined,
  storeName?: string | null,
): string {
  const host = (rawHost || "").trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  if (host && !/\.myshopify\.com$/i.test(host) && host.includes(".")) {
    return host.toLowerCase();
  }
  const cleanBrand = sanitizeStoreName(storeName || host || "store");
  const slug = cleanBrand
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
  return `${slug || "store"}.com`;
}

