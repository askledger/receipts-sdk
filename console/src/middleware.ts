/**
 * Edge middleware — runs before every request.
 *
 * Responsibilities:
 *   1. Inject a per-request CSP nonce so future inline scripts (none today)
 *      can be allow-listed precisely.
 *   2. Enforce session presence for protected routes; redirect to /login.
 *   3. Add a request id for tracing.
 *   4. Set the full enterprise security header bundle on every response:
 *      Strict-Transport-Security (HSTS), Content-Security-Policy,
 *      X-Content-Type-Options, Referrer-Policy, Permissions-Policy,
 *      X-Frame-Options.
 *
 * The header values match the mandatory list in
 * docs/security/HARDENING_CHECKLIST.md §F.1. CI verifies that they exist
 * in this file via tools/verify-hardening.ts.
 */

import { NextResponse, type NextRequest } from "next/server";

/**
 * Build the security header bundle. The CSP uses the per-request nonce
 * so that future inline scripts can be allow-listed precisely without
 * loosening the rest of the policy.
 */
function securityHeaders(nonce: string): Record<string, string> {
  return {
    // HSTS — 2 years, include subdomains, preload-list eligible.
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    // Strict CSP — no inline, no eval. Inline styles allowed because
    // Tailwind injects them. Sources are self only.
    "Content-Security-Policy": [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}'`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
}

const PROTECTED_PREFIXES = [
  "/",
  "/receipts",
  "/policies",
  "/keys",
  "/workflows",
  "/evidence",
  "/tenants",
  "/audit",
  "/settings",
];

const PUBLIC_PREFIXES = [
  "/login",
  "/api/health",
  "/_next",
  "/favicon",
];

function isProtected(pathname: string): boolean {
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return false;
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    pathname === "/";
}

export function middleware(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const nonce = crypto.randomUUID();

  const url = req.nextUrl.clone();

  if (isProtected(url.pathname)) {
    const session = req.cookies.get("pl_session");
    if (!session) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("next", url.pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  const res = NextResponse.next({ request: { headers: req.headers } });
  res.headers.set("x-request-id", requestId);
  res.headers.set("x-csp-nonce", nonce);
  for (const [k, v] of Object.entries(securityHeaders(nonce))) {
    res.headers.set(k, v);
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
