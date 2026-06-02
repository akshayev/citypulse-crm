import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Since it's a static site, we need to export it. However, Next.js server actions / API routes
  // cannot be statically exported. Let's see if we can convert the deployment to a Web Service instead
  // to avoid Next.js static export limitations (as the project has /api routes like /api/scrape)
};

export default nextConfig;
