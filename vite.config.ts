import { defineConfig } from "vite";

// Relative base so the same build works on GitHub Pages (https://<user>.github.io/<repo>/) and locally.
export default defineConfig({
  base: "./",
  esbuild: { jsx: "automatic" },
  oxc: { jsx: { runtime: "automatic" } },
  build: { chunkSizeWarningLimit: 1500 },
});
