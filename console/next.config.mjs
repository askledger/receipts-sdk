/**
 * Next.js config with production-grade security headers.
 *
 * CSP is strict-by-default. Inline scripts are forbidden in production;
 * pages that need inline runtime config use nonces (set by middleware).
 * Anything that loosens this must be reviewed by the security team and
 * documented in docs/security/.
 */

const CSP_STRICT = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "script-src 'self' 'wasm-unsafe-eval'",  // wasm for in-browser verifier
  "style-src 'self' 'unsafe-inline'",       // Tailwind hashed at build time
  "connect-src 'self' https://api.github.com/askledger/receipts-sdk https://*.github.com/askledger/receipts-sdk",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP_STRICT },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "accelerometer=(),camera=(),geolocation=(),gyroscope=(),microphone=(),payment=(),usb=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true, // stabilized to a top-level option in Next 15.5
  transpilePackages: ["@askledger/receipts-sdk"],
  webpack: (config) => {
    // The app uses explicit-extension ESM imports (`./foo.js`) that point at
    // TypeScript sources. tsconfig's "bundler" resolution handles this for
    // typecheck; mirror it for the webpack build so `.js` resolves to `.ts`.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
