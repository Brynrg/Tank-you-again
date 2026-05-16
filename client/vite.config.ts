import { defineConfig } from "vite";
import path from "node:path";

const sharedDir = path.resolve(__dirname, "../shared");

export default defineConfig({
  server: {
    port: 5173,
    host: "0.0.0.0",
  },
  resolve: {
    alias: [
      // Mirror tsconfig.json `paths: { "@shared/*": ["shared/*"] }` so client
      // code can `import x from "@shared/types"` and Vite resolves it.
      { find: /^@shared\/(.*)$/, replacement: path.join(sharedDir, "$1") },
    ],
  },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
  },
});
