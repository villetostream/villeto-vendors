import type { NextConfig } from "next";

function buildContentSecurityPolicy(): string {
  const isDev = process.env.NODE_ENV !== "production";
  const configuredApi = process.env.NEXT_PUBLIC_API_URL?.trim();
  let apiOrigin = "https://api.villeto.com";
  if (configuredApi) {
    try {
      apiOrigin = new URL(configuredApi).origin;
    } catch {
      // Keep default production API origin if invalid
    }
  }

  const connectSources = [
    "'self'",
    apiOrigin,
    "https://api.villeto.com",
    ...(isDev ? ["http://localhost:*", "ws://localhost:*", "wss://localhost:*"] : []),
  ];

  // Static Next.js App Router pages emit inline hydration scripts and inline styles.
  // object-src 'none', base-uri 'self', form-action 'self', and frame-ancestors 'none'
  // block plugin/base/form/framing injection while keeping static prerendering compatible.
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://flagcdn.com https://lh3.googleusercontent.com https://avatars.githubusercontent.com https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src ${Array.from(new Set(connectSources)).join(" ")}`,
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    // `domains` is deprecated in favor of `remotePatterns`, which also lets
    // us lock down protocol + path instead of trusting the whole host.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
        pathname: "/**",
      },
    ],
  },
  // Security headers applied at the web tier. Server-side controls
  // (CORS, auth, rate limiting) remain enforced by the external backend.
  async headers() {
    const securityHeaders = [
      { key: "Content-Security-Policy", value: buildContentSecurityPolicy() },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "X-DNS-Prefetch-Control", value: "off" },
    ];

    if (process.env.NODE_ENV === "production") {
      securityHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
      });
    }

    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
