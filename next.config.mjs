/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["firebase-admin"],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    // On Vercel, the Next.js /api routes would run as serverless functions and
    // SHADOW the intended proxy to the VPS backend (which alone holds the
    // service-account secret). A vercel.json rewrite is checked *after*
    // filesystem routes, so it never wins. A `beforeFiles` rewrite is evaluated
    // BEFORE filesystem routes, so it reliably forwards every /api/* call to the
    // VPS. Gated to Vercel (VERCEL=1) so the VPS's own build doesn't proxy to
    // itself (infinite loop).
    if (process.env.VERCEL !== "1") return []
    const origin = process.env.BACKEND_PROXY_ORIGIN || "http://38.248.12.6"
    return {
      beforeFiles: [{ source: "/api/:path*", destination: `${origin}/api/:path*` }],
    }
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ]
  },
}

export default nextConfig
