import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import availability from "./api/availability.ts";

// public/sw.js and public/manifest.json are plain static files — Vite copies
// everything in public/ to the build output as-is, no bundling needed for
// either (the service worker deliberately isn't a Vite entry point so it
// keeps a stable, predictable URL at /sw.js).
export default defineConfig({
  plugins: [
    react(),
    {
      name: "local-seat-availability",
      configureServer(server) {
        server.middlewares.use("/api/availability", (req, res) => {
          const url = new URL(req.url ?? "/", "http://localhost");
          void availability(
            { query: Object.fromEntries(url.searchParams) },
            {
              setHeader: (name, value) => res.setHeader(name, value),
              status: (code) => ({
                json: (body) => {
                  res.statusCode = code;
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify(body));
                },
              }),
            },
          );
        });
      },
    },
  ],
});
