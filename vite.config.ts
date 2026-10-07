import { defineConfig } from "vitest/config";

export default defineConfig({
  server: { host: "127.0.0.1", port: 5173 },
  optimizeDeps: { include: ["three", "three/addons/loaders/GLTFLoader.js", "@pixiv/three-vrm"] },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
