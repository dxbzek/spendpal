import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { VitePWA } from "vite-plugin-pwa";
import { PUBLIC_PAGES, withNotFoundHead, withPageHead } from "./src/lib/publicSite";

// After the build, write one HTML file per public page (its own title,
// description and canonical) and 404.html. All of them are the same app; only
// the head differs. vercel.json serves the page files at /privacy, /terms and
// /auth, and Vercel answers any address it has no rule for with 404.html and a
// real 404 status, where the app then shows its own "Page not found".
const publicPageFiles = (): Plugin => ({
  name: "spendpal-public-page-files",
  apply: "build",
  closeBundle() {
    const dist = path.resolve(__dirname, "dist");
    const index = fs.readFileSync(path.join(dist, "index.html"), "utf8");
    for (const page of PUBLIC_PAGES) {
      if (page.file === "index.html") continue;
      fs.writeFileSync(path.join(dist, page.file), withPageHead(index, page));
    }
    fs.writeFileSync(path.join(dist, "404.html"), withNotFoundHead(index));
  },
});

// https://vitejs.dev/config/
export default defineConfig(() => ({
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return;
          // Heavy, self-contained libraries that do NOT contain React's core.
          // These are safe to isolate because nothing in react-vendor imports
          // back from them, so no circular chunk dependency can form.
          if (id.includes('/xlsx/')) return 'xlsx';
          if (id.includes('/pdfjs-dist/')) return 'pdf';
          if (id.includes('/@supabase/')) return 'supabase';
          // recharts (+ its d3 deps) is large and only loaded lazily by chart
          // components, so keep it out of the eager react-vendor bundle.
          if (id.includes('/recharts/') || id.includes('/d3-') || id.includes('/victory-vendor/')) return 'recharts';
          // React core and EVERY library that consumes it must stay together.
          // Splitting them (e.g. a separate "radix" or "framer" chunk) lets
          // Rollup scatter the shared CommonJS interop helpers — which React's
          // CJS build relies on — across chunks. That creates circular chunk
          // imports (react-vendor <-> radix), and whichever evaluates first
          // sees React still undefined, crashing with errors like
          // "Cannot read properties of undefined (reading 'forwardRef')".
          return 'react-vendor';
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    publicPageFiles(),
    VitePWA({
      // "prompt": a new build waits until the user taps the "New version"
      // toast (src/lib/pwaUpdate.ts), which then reloads onto it. We register
      // the service worker ourselves for that, hence injectRegister: false.
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["favicon.ico", "favicon.svg", "apple-touch-icon.png", "pwa-192.png", "pwa-512.png", "pwa-maskable-512.png"],
      workbox: {
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/~oauth/],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
      },
      manifest: {
        name: "SpendPal - Personal Finance Tracker",
        short_name: "SpendPal",
        description: "Track your spending, budgets, and financial goals",
        theme_color: "#17663a",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
