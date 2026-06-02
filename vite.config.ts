import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

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
    VitePWA({
      registerType: "autoUpdate",
      // We register the service worker ourselves in main.tsx so we can
      // reload the page as soon as a new build activates. Without that
      // reload, clients keep running the previously cached bundle
      // indefinitely and never pick up shipped fixes.
      injectRegister: false,
      includeAssets: ["favicon.ico", "pwa-192.png", "pwa-512.png"],
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
        theme_color: "#1e7a42",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
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
