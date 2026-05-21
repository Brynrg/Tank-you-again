import { defineConfig } from "vitest/config";
import path from "node:path";

const sharedDir = path.resolve(__dirname, "shared");

export default defineConfig({
  test: {
    environment: "node",
    include: ["server/src/**/*.test.ts", "shared/**/*.test.ts"],
    pool: "forks",
  },
  resolve: {
    alias: [{ find: /^@shared\/(.*)$/, replacement: path.join(sharedDir, "$1") }],
  },
});
