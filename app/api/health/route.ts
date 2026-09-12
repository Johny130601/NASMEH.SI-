import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Liveness + readiness for the Docker HEALTHCHECK, the uptime checker and the
 * runbook (docs/RUNBOOK.md): 200 with `db: "up"` when a round trip to Postgres
 * succeeds, 503 with `db: "down"` otherwise. Process metrics ride along so a
 * checker that keeps history shows memory growth before it becomes an outage.
 */
export async function GET() {
  const memory = process.memoryUsage();
  const processInfo = {
    uptime: Math.round(process.uptime()),
    memory: { rssMb: Math.round(memory.rss / 1048576), heapUsedMb: Math.round(memory.heapUsed / 1048576) },
    node: process.version,
  };
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "up", ...processInfo }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "error", db: "down", ...processInfo }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
