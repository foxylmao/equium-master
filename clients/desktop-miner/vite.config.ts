import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri expects a fixed port (5173) so its dev server can connect.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2020",
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
  },
});
