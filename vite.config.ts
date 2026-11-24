import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import type { Plugin } from "vite";

// Powder-coat ground; matches --bg in src/styles/tokens.css (dark theme).
const POWDER = "#12100e";

// Public path the app is served from. "/" for local dev; the GitHub Pages build sets
// VITE_BASE=/setstamp/ (see .github/workflows/pages.yml). Always ends with "/".
// No @types/node in this project; only env access is needed here.
declare const process: { env: Record<string, string | undefined> };
const BASE = (process.env.VITE_BASE ?? "/").replace(/\/?$/, "/");

// GitHub Pages has no SPA rewrites: an unknown path (e.g. an emailed /auth/... link) serves
// 404.html, so ship the app shell under that name too.
function spaFallback404(): Plugin {
  return {
    name: "spa-fallback-404",
    apply: "build",
    enforce: "post",
    generateBundle(_, bundle) {
      const index = bundle["index.html"];
      if (!index || index.type !== "asset") return;
      // Same shell, but kept out of search results so it never competes with the real landing page.
      const html = typeof index.source === "string" ? index.source : new TextDecoder().decode(index.source);
      const source = html.replace(/(<meta charset[^>]*>)/i, '$1\n    <meta name="robots" content="noindex" />');
      this.emitFile({ type: "asset", fileName: "404.html", source });
    },
  };
}

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    spaFallback404(),
    tailwindcss(),
    VitePWA({
      // "prompt" + periodic update checks (src/app/UpdatePrompt.tsx): new versions are
      // fetched automatically, but the page only reloads when the lifter taps "Reload",
      // so an update never interrupts a set.
      registerType: "prompt",
      injectRegister: false,
      manifest: {
        id: BASE,
        name: "Setstamp: lifting log",
        short_name: "Setstamp",
        description: "A free lifting log that works offline.",
        lang: "en",
        // Marker lets the app tell a home-screen launch apart (src/features/landing/entry.ts) even
        // where display-mode is unreliable; navigateFallback still serves index.html offline.
        start_url: `${BASE}?source=pwa`,
        scope: BASE,
        display: "standalone",
        orientation: "portrait",
        theme_color: POWDER,
        background_color: POWDER,
        categories: ["health", "fitness", "sports"],
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest,json,woff2}"],
        globIgnores: ["404.html", "og.png"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//, /\/[^/?]+\.[^/]+$/],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Exercise images are third-party hotlinks (free-exercise-db on GitHub raw).
            // Load them with crossOrigin="anonymous" so responses are CORS (status 200)
            // rather than opaque; opaque entries are padded heavily against storage quota.
            urlPattern: ({ url }) => url.origin === "https://raw.githubusercontent.com",
            handler: "CacheFirst",
            options: {
              cacheName: "exercise-images-v1",
              expiration: {
                maxEntries: 300,
                maxAgeSeconds: 60 * 60 * 24 * 60,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: "es2022",
  },
});
