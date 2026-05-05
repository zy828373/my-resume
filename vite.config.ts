import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import "./server/env";

function parsePort(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535 ? parsed : fallback;
}

function resolveProxyHost(value: string | undefined) {
  const host = value?.trim() || "127.0.0.1";
  return host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
}

function formatProxyHost(host: string) {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

const backendTarget = `http://${formatProxyHost(resolveProxyHost(process.env.HOST))}:${parsePort(process.env.PORT, 8787)}`;

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react")) {
            return "react";
          }

          if (id.includes("node_modules/zrender")) {
            return "zrender";
          }

          if (id.includes("node_modules/echarts")) {
            return "echarts";
          }

          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": backendTarget,
    },
  },
});
