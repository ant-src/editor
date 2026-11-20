import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // Pre-bundling would move the Ant packages away from the worker.js and ant.wasm they load by
  // new URL(..., import.meta.url).
  optimizeDeps: { exclude: ["@ant-lang/monaco", "@ant-lang/wasm"] },
  // The Ant packages may be linked from a checkout of ant-web, which has a monaco-editor of its own.
  resolve: { dedupe: ["monaco-editor"] },
  worker: { format: "es" },
  build: { target: "esnext", chunkSizeWarningLimit: 5000 },
  test: { environment: "node", testTimeout: 20000 },
});
