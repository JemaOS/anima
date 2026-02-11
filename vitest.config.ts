import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/tests/setup.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
    include: ["src/tests/**/*.{test,spec}.{ts,tsx}"],
    typecheck: {
      enabled: false,
    },
    deps: {
      interopDefault: true,
      optimizer: {
        web: {
          include: ["@testing-library/jest-dom"],
        },
      },
    },
    alias: {
      "@/": path.resolve(__dirname, "./src/"),
    },
    server: {
      deps: {
        inline: [/@testing-library\/jest-dom/],
      },
    },
    mockReset: true,
    restoreMocks: true,
    css: false,
    retry: 0,
    bail: 0,
    testTimeout: 10000,
    hookTimeout: 10000,
    reporters: ["verbose"],
    logHeapUsage: true,
    maxWorkers: 1,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
