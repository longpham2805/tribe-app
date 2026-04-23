import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../public",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": "http://localhost:3100",
      "/mcp": "http://localhost:3100",
      "/ws": { target: "ws://localhost:3100", ws: true },
    },
  },
});
