/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  // Dev-only reverse proxy so the browser preview stays same-origin.
  // On device, CapacitorHttp talks to the real domains directly (no proxy, no CORS).
  // Configure the targets in a local .env file (see .env.example).
  const proxy: Record<string, any> = {};
  const addProxy = (route: string, target?: string) => {
    if (!target) return;
    proxy[route] = {
      target,
      changeOrigin: true,
      secure: false,
      rewrite: (p: string) => p.replace(new RegExp(`^${route}`), ""),
    };
  };
  addProxy("/proxy-authelia", env.DEV_AUTHELIA_URL);
  addProxy("/proxy-radarr", env.DEV_RADARR_URL);
  addProxy("/proxy-sonarr", env.DEV_SONARR_URL);

  return {
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
      include: ["src/**/*.test.ts"],
      exclude: ["node_modules/**"],
    },
    server: {
      port: 5173,
      host: true, // allow network access for on-device / LAN testing
      proxy,
    },
    build: {
      outDir: "dist",
      assetsDir: "assets",
      sourcemap: false,
    },
  };
});
