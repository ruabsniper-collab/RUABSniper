import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// public/sw.js and public/manifest.json are plain static files — Vite copies
// everything in public/ to the build output as-is, no bundling needed for
// either (the service worker deliberately isn't a Vite entry point so it
// keeps a stable, predictable URL at /sw.js).
export default defineConfig({
  plugins: [react()],
});
