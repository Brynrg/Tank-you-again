#!/usr/bin/env node
// scripts/stage-dist.mjs
//
// Mirror client/dist/ → dist/ at the repo root so the portal's
// `scripts/ingest-game-build.mjs` (which expects `<game-dir>/dist/index.html`)
// can ingest this game without any extra arguments.
//
// Idempotent: removes the existing repo-root dist/ before copying.

import { cpSync, existsSync, rmSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(ROOT, "client/dist");
const DST = resolve(ROOT, "dist");

if (!existsSync(SRC) || !statSync(SRC).isDirectory()) {
  console.error(`✗ stage-dist: ${SRC} missing — run \`npm run build:portal --workspace=client\` first`);
  process.exit(1);
}
if (existsSync(DST)) {
  rmSync(DST, { recursive: true, force: true });
}
cpSync(SRC, DST, { recursive: true });
console.log(`✓ staged client/dist → dist (${DST})`);
