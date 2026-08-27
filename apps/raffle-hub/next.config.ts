import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    /*
     * Pin the root to this app.
     *
     * Turbopack otherwise walks up looking for a lockfile and can land outside
     * the app — in this monorepo it reached as far as the home directory. Each
     * app here is an island with its own lockfile, so the root is simply this
     * folder.
     */
    root: path.resolve(import.meta.dirname),
  },
};

export default nextConfig;
