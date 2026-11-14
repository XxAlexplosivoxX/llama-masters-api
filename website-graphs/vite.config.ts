import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  // Same data folder the website serves: /data/places.json, /data/<place>/…, /data/regions/…
  publicDir: "../website/public",
  server: { fs: { allow: [".."] } },
});
