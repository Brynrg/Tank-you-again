// Quick reachability check for the configured DATABASE_URL.
//
// Run:   npm run db:test
// Reads .env at repo root (and falls back to server/.env), opens a TCP
// connection to the Postgres host, then attempts a Prisma $connect to
// confirm credentials and database name resolve.

import "dotenv/config";
import net from "node:net";
import { performance } from "node:perf_hooks";
import { PrismaClient } from "@prisma/client";

const DATABASE_URL = process.env.DATABASE_URL;

const logger = {
  info: (msg: string) => console.info(msg),
  error: (msg: string, err?: any) => (err ? console.error(msg, err) : console.error(msg)),
};

if (!DATABASE_URL || DATABASE_URL.includes("USER:PASSWORD")) {
  logger.error("✗ DATABASE_URL is unset or still has the placeholder. Edit .env first.");
  process.exit(1);
}

function parseHostPort(url: string): { host: string; port: number } {
  const parsed = new URL(url);
  const host = parsed.hostname;
  const port = parsed.port ? Number(parsed.port) : 5432;
  return { host, port };
}

async function tcpReachable(host: string, port: number, timeoutMs = 5000): Promise<number> {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const sock = new net.Socket();
    const finish = (fn: () => void) => {
      sock.destroy();
      fn();
    };
    sock.setTimeout(timeoutMs);
    sock.once("connect", () => finish(() => resolve(performance.now() - started)));
    sock.once("timeout", () =>
      finish(() => reject(new Error(`TCP timeout after ${timeoutMs} ms`))),
    );
    sock.once("error", (err) => finish(() => reject(err)));
    sock.connect(port, host);
  });
}

async function main(): Promise<void> {
  const { host, port } = parseHostPort(DATABASE_URL!);
  logger.info(`▶ TCP ${host}:${port} …`);
  const tcpMs = await tcpReachable(host, port);
  logger.info(`✓ TCP reachable in ${tcpMs.toFixed(0)} ms`);

  logger.info(`▶ Prisma $connect …`);
  const prisma = new PrismaClient();
  try {
    const started = performance.now();
    await prisma.$connect();
    const rows = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`;
    const ms = performance.now() - started;
    if (rows[0]?.ok !== 1) throw new Error("unexpected SELECT 1 result");
    logger.info(`✓ Prisma round-trip in ${ms.toFixed(0)} ms`);
  } finally {
    await prisma.$disconnect();
  }
  logger.info("✓ All checks passed.");
}

main().catch((err) => {
  logger.error("✗ Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
