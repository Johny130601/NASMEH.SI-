import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      db: "up",
      uptime: Math.round(process.uptime()),
    });
  } catch {
    return NextResponse.json({ status: "error", db: "down" }, { status: 503 });
  }
}
