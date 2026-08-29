// Soft-404 policy (ADR-005): a URL that would 404 redirects one level up
// instead, walking toward the nearest live page. Pure functions; the
// catch-all route in `app/[...slug]` is a thin caller.

/** Extensions start with a letter, so slugs like `v1.2` stay redirectable. */
const FILE_EXTENSION = /\.[a-z][a-z0-9]*$/i;

/**
 * The path to redirect a would-be 404 to, or `null` for a hard 404.
 *
 * Hard 404s: unknown `/api/*` paths (API clients must get a 404 status,
 * never an HTML redirect chain) and asset-shaped paths (a missing favicon
 * or a `/wp-login.php` bot probe should not bounce to the homepage).
 */
export function softRedirectTarget(segments: readonly string[], search = ""): string | null {
  const last = segments.at(-1);
  // Case-insensitive: /API/x is a 404 on case-sensitive prod routing and
  // must hard-404 like /api/x, not enter an HTML redirect chain.
  if (last === undefined || segments[0]?.toLowerCase() === "api") return null;
  if (FILE_EXTENSION.test(last)) return null;
  const parent = segments.slice(0, -1).map(encodeURIComponent).join("/");
  return `/${parent}${search}`;
}

/** Rebuild a `?key=value` suffix from a page's `searchParams` prop. */
export function buildSearchSuffix(
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) params.append(key, item);
  }
  const suffix = params.toString();
  return suffix ? `?${suffix}` : "";
}
