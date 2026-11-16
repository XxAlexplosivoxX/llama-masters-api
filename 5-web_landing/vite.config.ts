import { defineConfig, lazyPlugins } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: lazyPlugins(() => [react(), tailwindcss()]),
  base: "/", // tonalli.earth; the atlas (4-web_atlas) is served next to it at /atlas/
  server: {
    // Local `bun run dev` has no worker in front, so /atlas/ would stay on this app.
    // The atlas dev server (port 5174, base /atlas/) answers those requests instead.
    proxy: {
      "/atlas": { target: "http://127.0.0.1:5174", ws: true },
    },
  },
  test: {
    setupFiles: ["./src/test/setup.ts"],
    // Pin the build-time URLs so a developer's .env.local does not change what the tests see.
    env: { VITE_API_URL: "", VITE_ATLAS_URL: "/atlas/" },
  },
  fmt: { printWidth: 120 },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
});
