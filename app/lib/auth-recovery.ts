/** Retry a document load without replaying an expired JWT or a Remix data URL. */
export function authRecoveryPath(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  const retryParams = new URLSearchParams();
  for (const key of ["shop", "host", "embedded"]) {
    const value = params.get(key);
    if (value) retryParams.set(key, value);
  }
  const path = /^\/app(?:\/|$)/.test(pathname) ? pathname : "/app";
  const query = retryParams.toString();
  return query ? `${path}?${query}` : "/auth/login";
}
