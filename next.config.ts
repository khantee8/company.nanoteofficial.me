import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'self' https://nanoteofficial.me https://*.nanoteofficial.me",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The agent personas read `.agents/*.md` at runtime (see src/lib/agents/roles.ts).
  // Next's tracer can't follow the dynamic readFileSync path, so include the
  // briefs explicitly in every API function bundle that may run an agent.
  outputFileTracingIncludes: {
    "/api/**": ["./.agents/**/*", "./db/schema.sql", "./db/plan-schema.sql"],
    // The /doc pages read content/doc/<lang>/*.md (see src/lib/doc.ts). Pages are
    // statically generated, but include the content defensively for any on-demand
    // render — same mechanism as the agent briefs above.
    "/doc/**": ["./content/doc/**/*"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
