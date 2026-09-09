import { NextResponse } from "next/server";
import { parseSearchQuery, searchProducts } from "@/lib/search";

export const dynamic = "force-dynamic";

/** Instant search endpoint (§3.1) — zod-validated input (AGENTS §8.2). */
export async function GET(request: Request) {
  const query = parseSearchQuery(
    new URL(request.url).searchParams.get("q"),
  );
  const results = query.length < 2 ? [] : await searchProducts(query, 6);
  return NextResponse.json({ results });
}
