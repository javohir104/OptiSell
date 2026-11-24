import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Dev only: the proxy forwards /api/v1/ai/* to the AI service and adds X-API-Key
// on the server side, so the secret never reaches the browser bundle.
// In production the browser calls the OptiSell backend, which calls the AI service.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const target = env.AI_SERVICE_URL || "http://localhost:8001";
  const apiKey = env.AI_SERVICE_API_KEY || "";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api/v1/ai": {
          target,
          changeOrigin: true,
          headers: (apiKey ? { "X-API-Key": apiKey } : {}) as Record<string, string>,
        },
      },
    },
  };
});
