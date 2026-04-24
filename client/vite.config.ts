import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const isExpectedSocketCloseError = (err: unknown): boolean => {
  const maybeErr = err as { code?: string } | null;
  return maybeErr?.code === "EPIPE" || maybeErr?.code === "ECONNRESET";
};

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../public",
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 8200,
    proxy: {
      "/api": "http://localhost:8100",
      "/mcp": "http://localhost:8100",
      "/ws": {
        target: "ws://localhost:8100",
        ws: true,
        configure(proxy) {
          proxy.on("error", (err) => {
            if (isExpectedSocketCloseError(err)) return;
            console.error("[vite] ws proxy error:", err);
          });
        },
      },
    },
  },
});
