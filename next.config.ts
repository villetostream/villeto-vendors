import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
  // Baseline security headers. These don't replace server-side controls
  // (CORS, auth, rate limiting) but they close off a few common client-side
  // attack vectors (clickjacking, MIME sniffing, referrer leakage).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
