/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ["avatars.githubusercontent.com"],
  },
  devIndicators: false,
  async rewrites() {
    return {
      beforeFiles: [
        // Handle subdomain routing
        {
          source: "/:path*",
          has: [
            {
              type: "host",
              value: "(?<subdomain>[^.]+).yourdomain.com",
            },
          ],
          destination: "/org/:subdomain/:path*",
        },
      ],
    };
  },
};

export default nextConfig;
