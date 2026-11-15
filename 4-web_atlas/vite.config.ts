import { defineConfig, lazyPlugins } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: lazyPlugins(() => [react(), tailwindcss()]),
  base: "/atlas/", // served at tonalli.earth/atlas/ (3-api_atlas)
  worker: { format: "es" }, // MapLibre 6 starts its worker as a module worker
  preview: { allowedHosts: [".trycloudflare.com"] },
  fmt: { printWidth: 120 },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
});
