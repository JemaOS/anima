import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { compression } from "vite-plugin-compression2";

const isProd = process.env.BUILD_MODE === "prod";

export default defineConfig({
  plugins: [
    react({
      // Optimisations Babel pour React
      babel: {
        plugins: isProd
          ? [
              [
                "babel-plugin-transform-react-remove-prop-types",
                { removeImport: true },
              ],
            ]
          : [],
      },
    }),
    // Compression Brotli et Gzip pour les assets statiques
    compression({
      algorithms: ["brotliCompress", "gzip"],
      exclude: [/\.(br)$/, /\.(gz)$/],
      threshold: 10240, // 10KB
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Optimisations du build
  build: {
    // Taille de chunk optimale pour le cache
    chunkSizeWarningLimit: 500,
    // Code splitting automatique
    rollupOptions: {
      output: {
        // Séparer les chunks par vendor pour un meilleur cache
        manualChunks: {
          // React core
          "react-core": ["react", "react-dom"],
          // Router
          router: ["react-router-dom"],
          // WebRTC et P2P
          webrtc: ["peerjs", "simple-peer"],
          // UI components (Radix)
          "ui-components": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "@radix-ui/react-tooltip",
          ],
          // Utils
          utils: ["clsx", "tailwind-merge", "class-variance-authority"],
          // Forms
          forms: ["react-hook-form", "@hookform/resolvers", "zod"],
          // Charts (rarement utilisé, charger à la demande)
          charts: ["recharts"],
        },
        // Nommer les chunks pour un meilleur cache
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
    // Minification avec esbuild (plus rapide, pas besoin de terser)
    minify: "esbuild",
    // Améliorer le tree-shaking
    sourcemap: !isProd,
    // Précharger les modules critiques
    cssCodeSplit: true,
  },
  // Optimisations du serveur de développement
  server: {
    // HMR optimisé
    hmr: {
      overlay: false,
    },
    // Précharger les dépendances fréquemment utilisées
    preTransformRequests: true,
  },
  // Optimisations du pré-bundling
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-router-dom",
      "peerjs",
      "clsx",
      "tailwind-merge",
    ],
    exclude: [],
  },
});
