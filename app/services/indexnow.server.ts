export interface IndexNowResult {
  ok: boolean;
  status: number;
  submitted: number;
  message: string;
}

const ENDPOINT = "https://api.indexnow.org/indexnow";

export function generateIndexNowKey() {
  return crypto.randomUUID().replace(/-/g, "");
}

/** Root-level key file (served via URL redirect → app proxy). */
export function indexNowKeyLocation(host: string, key: string) {
  return `https://${host}/${key}.txt`;
}

/**
 * POSTs URLs to https://api.indexnow.org/indexnow. A 200 or 202 means that
 * endpoint accepted the request. This app does not confirm which engines
 * indexed the URLs.
 */
export async function pingIndexNow(host: string, key: string, urls: string[]): Promise<IndexNowResult> {
  const urlList = Array.from(new Set(urls)).slice(0, 10_000);
  if (!urlList.length) return { ok: false, status: 0, submitted: 0, message: "No URLs to submit" };

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host, key, keyLocation: indexNowKeyLocation(host, key), urlList }),
      signal: AbortSignal.timeout(4_000),
    });
    const ok = response.status === 200 || response.status === 202;
    const messages: Record<number, string> = {
      200: "Accepted — URLs submitted",
      202: "Accepted — key validation pending",
      400: "Bad request",
      403: "Key not valid for this host",
      422: "URLs don't belong to host or key mismatch",
      429: "Rate limited — try again shortly",
    };
    return { ok, status: response.status, submitted: ok ? urlList.length : 0, message: messages[response.status] ?? `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, status: 0, submitted: 0, message: error instanceof Error ? error.message : "Network error" };
  }
}
