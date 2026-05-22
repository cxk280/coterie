import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Slim self-contained output for the runtime Docker stage.
  output: "standalone",
};

export default config;
